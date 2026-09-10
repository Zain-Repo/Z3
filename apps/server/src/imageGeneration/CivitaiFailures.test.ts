import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { generateCivitaiImage } from "./CivitaiApi.ts";

const input = { model: "civitai/z-image-turbo", prompt: "A cat" };
const decodeSubmission = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      externalId: Schema.String,
      currencies: Schema.Array(Schema.String),
    }),
  ),
);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const pending = { id: "wf_test", status: "processing", steps: [] };
const completed = {
  ...pending,
  status: "succeeded",
  steps: [{ output: { images: [{ available: true, url: "https://image.civitai.com/test.png" }] } }],
};

describe("Civitai request failures", () => {
  it.effect(
    "retries submission with the same idempotency key and uses a new key for a new generation",
    () =>
      Effect.gen(function* () {
        const identifiers: string[] = [];
        const client = HttpClient.make((request) => {
          if (request.method === "POST") {
            expect(request.body._tag).toBe("Uint8Array");
            if (request.body._tag === "Uint8Array") {
              const body = decodeSubmission(new TextDecoder().decode(request.body.body));
              expect(body.currencies).toEqual([]);
              identifiers.push(body.externalId);
            }
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                identifiers.length === 1
                  ? new Response(null, { status: 500 })
                  : Response.json(completed),
              ),
            );
          }
          return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(png)));
        });
        const fiber = yield* generateCivitaiImage(client, "test-key", input).pipe(Effect.forkChild);
        yield* TestClock.adjust("5 seconds");
        expect((yield* Fiber.join(fiber)).data).toHaveLength(1);
        expect((yield* generateCivitaiImage(client, "test-key", input)).data).toHaveLength(1);
        expect(identifiers).toHaveLength(3);
        expect(identifiers[0]).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
        expect(identifiers[1]).toBe(identifiers[0]);
        expect(identifiers[2]).not.toBe(identifiers[0]);
      }),
  );

  for (const status of [429, 500, 502, 503]) {
    it.effect(`bounds idempotent submission retries after HTTP ${status}`, () =>
      Effect.gen(function* () {
        let requests = 0;
        const client = HttpClient.make((request) => {
          requests++;
          return Effect.succeed(
            HttpClientResponse.fromWeb(request, new Response("private", { status })),
          );
        });
        const fiber = yield* generateCivitaiImage(client, "test-key", input).pipe(
          Effect.result,
          Effect.forkChild,
        );
        yield* TestClock.adjust("60 seconds");
        const result = yield* Fiber.join(fiber);
        expect(requests).toBe(5);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.message).not.toContain("private");
          if (status >= 500) expect(result.failure.message).toContain("may have been accepted");
        }
      }),
    );
  }

  it.effect("does not retry earlier than a long Retry-After limit", () =>
    Effect.gen(function* () {
      let requests = 0;
      const client = HttpClient.make((request) => {
        requests++;
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(null, { status: 429, headers: { "retry-after": "120" } }),
          ),
        );
      });
      const result = yield* generateCivitaiImage(client, "test-key", input).pipe(Effect.result);
      expect(requests).toBe(1);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.message).toContain("rate limiting");
    }),
  );
  it.effect(
    "recovers from transient status failures without submitting a second paid workflow",
    () =>
      Effect.gen(function* () {
        let submissions = 0;
        let polls = 0;
        let cancellations = 0;
        const client = HttpClient.make((request) => {
          let response: Response;
          if (request.method === "POST") {
            submissions++;
            response = Response.json(pending, { status: 202 });
          } else if (request.method === "PUT") {
            cancellations++;
            response = new Response(null, { status: 204 });
          } else if (request.url.includes("/workflows/")) {
            polls++;
            response =
              polls <= 2
                ? new Response(null, {
                    status: polls === 1 ? 500 : 429,
                    headers: { "retry-after": "3" },
                  })
                : Response.json(completed);
          } else {
            response = new Response(png);
          }
          return Effect.succeed(HttpClientResponse.fromWeb(request, response));
        });
        const fiber = yield* generateCivitaiImage(client, "test-key", input).pipe(Effect.forkChild);
        yield* TestClock.adjust("30 seconds");
        const result = yield* Fiber.join(fiber);
        expect(result.data).toHaveLength(1);
        expect(submissions).toBe(1);
        expect(polls).toBe(3);
        expect(cancellations).toBe(0);
      }),
  );

  it.effect("bounds status retries and cancels only the original workflow", () =>
    Effect.gen(function* () {
      let polls = 0;
      let submissions = 0;
      let cancellations = 0;
      const client = HttpClient.make((request) => {
        let response: Response;
        if (request.method === "POST") {
          submissions++;
          response = Response.json(pending, { status: 202 });
        } else if (request.method === "PUT") {
          cancellations++;
          expect(request.url).toBe(
            "https://orchestration.civitai.com/v2/consumer/workflows/wf_test",
          );
          response = new Response(null, { status: 204 });
        } else {
          polls++;
          response = new Response("private upstream details", { status: 503 });
        }
        return Effect.succeed(HttpClientResponse.fromWeb(request, response));
      });
      const fiber = yield* generateCivitaiImage(client, "test-key", input).pipe(
        Effect.result,
        Effect.forkChild,
      );
      yield* TestClock.adjust("60 seconds");
      const result = yield* Fiber.join(fiber);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure.message).toContain("HTTP 503");
        expect(result.failure.message).not.toContain("private");
      }
      expect(polls).toBe(5);
      expect(submissions).toBe(1);
      expect(cancellations).toBe(1);
    }),
  );

  for (const status of [400, 401, 403, 404]) {
    it.effect(`does not automatically repeat a paid submission after HTTP ${status}`, () =>
      Effect.gen(function* () {
        let requests = 0;
        const client = HttpClient.make((request) => {
          requests++;
          return Effect.succeed(
            HttpClientResponse.fromWeb(request, new Response("private", { status })),
          );
        });
        const result = yield* generateCivitaiImage(client, "test-key", input).pipe(Effect.result);
        expect(requests).toBe(1);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.message).not.toContain("private");
          if (status >= 500) expect(result.failure.message).toContain("may have been accepted");
        }
      }),
    );
  }

  it.effect("reports documented validation fields without leaking prompt or token values", () =>
    Effect.gen(function* () {
      const client = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(
              {
                title: "private prompt",
                detail: "test-key",
                errors: {
                  "steps[0].input.resolution": ["private prompt"],
                  currencies: ["test-key"],
                  "secret-field-value": ["private"],
                },
              },
              { status: 400 },
            ),
          ),
        ),
      );
      const result = yield* generateCivitaiImage(client, "test-key", input).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure.message).toContain("resolution, currencies");
        expect(result.failure.message).not.toMatch(/private|test-key|secret-field/);
      }
    }),
  );

  for (const [reason, message] of [
    ["no_provider_available", "No Civitai provider is available"],
    ["blocked", "content moderation"],
    ["timeout", "could not finish"],
    ["unknown-private-reason", "Civitai image generation failed."],
  ]) {
    it.effect(`explains terminal job reason ${reason}`, () =>
      Effect.gen(function* () {
        const client = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ ...pending, status: "failed", steps: [{ jobs: [{ reason }] }] }),
            ),
          ),
        );
        const result = yield* generateCivitaiImage(client, "test-key", input).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.message).toContain(message);
          expect(result.failure.message).not.toContain("private");
        }
      }),
    );
  }
});
