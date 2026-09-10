import { describe, expect, it } from "@effect/vitest";
import type { ImageGenerationInput } from "@t3tools/contracts";
import { Deferred, Effect, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { fetchCivitaiImageModels, generateCivitaiImage } from "./CivitaiApi.ts";

const decodeJson = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const succeeded = (url = "https://image.civitai.com/generated.png") => ({
  id: "wf_test",
  status: "succeeded",
  steps: [{ output: { images: [{ type: "image", id: "blob_test", available: true, url }] } }],
});

describe("Civitai image generation", () => {
  it.effect("stops after one URL refresh when storage keeps rejecting the download", () =>
    Effect.gen(function* () {
      let submissions = 0;
      let refreshes = 0;
      let downloads = 0;
      const client = HttpClient.make((request) => {
        let response: Response;
        if (request.method === "POST") {
          submissions++;
          response = Response.json(succeeded());
        } else if (request.url.includes("/workflows/")) {
          refreshes++;
          response = Response.json(succeeded());
        } else {
          downloads++;
          response = new Response("private signed URL", { status: 403 });
        }
        return Effect.succeed(HttpClientResponse.fromWeb(request, response));
      });
      const result = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/z-image-base",
        prompt: "A cat",
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure")
        expect(result.failure.message).toBe("Civitai image download failed (HTTP 403).");
      expect(submissions).toBe(1);
      expect(refreshes).toBe(1);
      expect(downloads).toBe(2);
    }),
  );

  it.effect("reports redirects without a destination", () =>
    Effect.gen(function* () {
      const client = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            request.method === "POST"
              ? Response.json(succeeded())
              : new Response(null, { status: 308 }),
          ),
        ),
      );
      const result = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/z-image-base",
        prompt: "A cat",
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure")
        expect(result.failure.message).toContain("missing its destination");
    }),
  );
  it.effect("follows blob 308 and relative CDN redirects without leaking the API key", () =>
    Effect.gen(function* () {
      const visited: string[] = [];
      const client = HttpClient.make((request) => {
        visited.push(request.url);
        let response: Response;
        if (request.method === "POST")
          response = Response.json(
            succeeded("https://orchestration.civitai.com/v2/consumer/blobs/blob_test"),
          );
        else if (request.url.includes("/v2/consumer/blobs/")) {
          expect(request.headers.authorization).toBe("Bearer test-key");
          response = new Response(null, {
            status: 308,
            headers: { location: "https://image.civitai.com/start" },
          });
        } else {
          expect(request.headers.authorization).toBeUndefined();
          response = request.url.endsWith("/start")
            ? new Response(null, { status: 302, headers: { location: "/final.png" } })
            : new Response(png);
        }
        return Effect.succeed(HttpClientResponse.fromWeb(request, response));
      });
      const result = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/z-image-base",
        prompt: "A cat",
      });
      expect(result.data).toHaveLength(1);
      expect(visited).toHaveLength(4);
      expect(visited[3]).toBe("https://image.civitai.com/final.png");
    }),
  );

  it.effect("refreshes an expired signed URL using the same workflow and blob", () =>
    Effect.gen(function* () {
      let submissions = 0;
      let refreshes = 0;
      const client = HttpClient.make((request) => {
        let response: Response;
        if (request.method === "POST") {
          submissions++;
          response = Response.json(succeeded("https://image.civitai.com/expired"));
        } else if (request.url.includes("/workflows/")) {
          refreshes++;
          expect(request.headers.authorization).toBe("Bearer test-key");
          response = Response.json(succeeded("https://image.civitai.com/fresh"));
        } else {
          expect(request.headers.authorization).toBeUndefined();
          response = request.url.endsWith("/expired")
            ? new Response(null, { status: 403 })
            : new Response(png);
        }
        return Effect.succeed(HttpClientResponse.fromWeb(request, response));
      });
      const result = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/z-image-base",
        prompt: "A cat",
      });
      expect(result.data).toHaveLength(1);
      expect(submissions).toBe(1);
      expect(refreshes).toBe(1);
    }),
  );

  for (const location of [
    "https://127.0.0.1/image",
    "http://image.civitai.com/image",
    "https://internal.local/image",
    "https://user:pass@image.civitai.com/image",
  ]) {
    it.effect(`rejects unsafe redirect ${location}`, () =>
      Effect.gen(function* () {
        let requests = 0;
        const client = HttpClient.make((request) => {
          requests++;
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              request.method === "POST"
                ? Response.json(succeeded())
                : new Response(null, { status: 308, headers: { location } }),
            ),
          );
        });
        const result = yield* generateCivitaiImage(client, "test-key", {
          model: "civitai/z-image-base",
          prompt: "A cat",
        }).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        expect(requests).toBe(2);
      }),
    );
  }

  it.effect("bounds redirect loops", () =>
    Effect.gen(function* () {
      let requests = 0;
      const client = HttpClient.make((request) => {
        requests++;
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            request.method === "POST"
              ? Response.json(succeeded())
              : new Response(null, { status: 308, headers: { location: "/loop" } }),
          ),
        );
      });
      const result = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/z-image-base",
        prompt: "A cat",
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.message).toContain("redirect limit");
      expect(requests).toBe(7);
    }),
  );
  it.effect("polls HTTP 202 workflows through every queued state before downloading", () =>
    Effect.gen(function* () {
      const states = ["unassigned", "preparing", "scheduled", "processing"];
      let workflowRequests = 0;
      let submissions = 0;
      let downloads = 0;
      const client = HttpClient.make((request) => {
        if (request.url.startsWith("https://orchestration.civitai.com/")) {
          expect(request.headers.authorization).toBe("Bearer test-key");
          if (request.method === "POST") submissions++;
          else {
            expect(request.method).toBe("GET");
            expect(request.url).toBe(
              "https://orchestration.civitai.com/v2/consumer/workflows/wf_test?wait=15",
            );
          }
          const status = states[workflowRequests++];
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json(
                status ? { id: "wf_test", status, steps: [{ output: null }] } : succeeded(),
                { status: status ? 202 : 200 },
              ),
            ),
          );
        }
        downloads++;
        expect(request.headers.authorization).toBeUndefined();
        return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(png)));
      });
      const fiber = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/z-image-base",
        prompt: "A cat",
      }).pipe(Effect.forkChild);
      yield* TestClock.adjust("8 seconds");
      const result = yield* Fiber.join(fiber);
      expect(result.data).toHaveLength(1);
      expect(workflowRequests).toBe(5);
      expect(submissions).toBe(1);
      expect(downloads).toBe(1);
    }),
  );

  for (const status of ["failed", "expired", "canceled"]) {
    it.effect(`reports ${status} as a terminal status`, () =>
      Effect.gen(function* () {
        let requests = 0;
        const client = HttpClient.make((request) => {
          requests++;
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ id: "wf_test", status, steps: [{ output: null }] }),
            ),
          );
        });
        const result = yield* generateCivitaiImage(client, "test-key", {
          model: "civitai/z-image-base",
          prompt: "A cat",
        }).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(result.failure.message).toBe(`Civitai image generation ${status}.`);
        expect(requests).toBe(1);
      }),
    );
  }

  for (const image of [
    { available: false, url: null },
    { available: false },
    { available: true, url: null },
  ]) {
    it.effect(`handles unavailable output ${JSON.stringify(image)} without a decoding error`, () =>
      Effect.gen(function* () {
        let requests = 0;
        const client = HttpClient.make((request) => {
          requests++;
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({
                id: "wf_test",
                status: "succeeded",
                steps: [{ output: { images: [image] } }],
              }),
            ),
          );
        });
        const result = yield* generateCivitaiImage(client, "test-key", {
          model: "civitai/z-image-base",
          prompt: "A cat",
        }).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(result.failure.message).toContain("unavailable or withheld");
        expect(requests).toBe(1);
      }),
    );
  }

  it.effect("still rejects malformed workflow responses without resubmitting", () =>
    Effect.gen(function* () {
      let requests = 0;
      const client = HttpClient.make((request) => {
        requests++;
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({ status: "unknown", secret: "private" }),
          ),
        );
      });
      const result = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/z-image-base",
        prompt: "A cat",
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure")
        expect(result.failure.message).toBe("Civitai returned an invalid workflow response.");
      expect(requests).toBe(1);
    }),
  );

  it.effect("cancels the same workflow when an in-flight poll is interrupted", () =>
    Effect.gen(function* () {
      const polling = yield* Deferred.make<void>();
      let canceled = false;
      const client = HttpClient.make((request) => {
        if (request.method === "POST") {
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ id: "wf_test", status: "scheduled", steps: [] }, { status: 202 }),
            ),
          );
        }
        if (request.method === "PUT") {
          expect(request.url).toBe(
            "https://orchestration.civitai.com/v2/consumer/workflows/wf_test",
          );
          canceled = true;
          return Effect.succeed(
            HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })),
          );
        }
        return Deferred.succeed(polling, undefined).pipe(Effect.andThen(Effect.never));
      });
      const fiber = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/z-image-base",
        prompt: "A cat",
      }).pipe(Effect.forkChild);
      yield* TestClock.adjust("2 seconds");
      yield* Deferred.await(polling);
      yield* Fiber.interrupt(fiber);
      expect(canceled).toBe(true);
    }),
  );

  it.effect("reports a terminal failed job without downloading or resubmitting", () =>
    Effect.gen(function* () {
      let requests = 0;
      const client = HttpClient.make((request) => {
        requests++;
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({ id: "wf_test", status: "failed", steps: [] }),
          ),
        );
      });
      const result = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/flux2-max",
        prompt: "A cat",
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      expect(requests).toBe(1);
    }),
  );
  it.effect("exposes the supported built-in recipes without a paid request", () =>
    Effect.gen(function* () {
      const client = HttpClient.make(() => {
        throw new Error("Unexpected request");
      });
      const models = yield* fetchCivitaiImageModels(client, "test-key");
      expect(models.length).toBeGreaterThan(8);
      expect(
        models.every((model) => model.id.startsWith("civitai/") && !model.supportsStreaming),
      ).toBe(true);
      expect(models[0]?.supportedParameters.n).toEqual({ type: "range", min: 1, max: 4 });
    }),
  );

  for (const { label, input, parameters } of [
    {
      label: "Google uses numImages and aspect ratio",
      input: {
        model: "civitai/google-nano-banana-2",
        prompt: "A cat",
        n: 2,
        aspectRatio: "16:9",
        resolution: "2K",
        outputFormat: "png",
      },
      parameters: {
        engine: "google",
        model: "nano-banana-2",
        prompt: "A cat",
        numImages: 2,
        aspectRatio: "16:9",
        resolution: "2K",
        outputFormat: "png",
      },
    },
    {
      label: "OpenAI DALL-E uses a size string without dimensions or count",
      input: { model: "civitai/openai-dall-e-3", prompt: "A cat", size: "1792x1024" },
      parameters: {
        engine: "openai",
        model: "dall-e-3",
        operation: "createImage",
        prompt: "A cat",
        size: "1792x1024",
      },
    },
    {
      label: "FAL Qwen Pro uses imageSize and its distinct operation",
      input: { model: "civitai/fal-qwen2-pro", prompt: "A cat", size: "square_hd", seed: 42 },
      parameters: {
        engine: "fal",
        model: "qwen2",
        operation: "proCreateImage",
        prompt: "A cat",
        quantity: 1,
        imageSize: "square_hd",
        seed: 42,
      },
    },
    {
      label: "Seedream preserves version without inventing an operation",
      input: { model: "civitai/seedream-v4.5", prompt: "A cat", size: "1536x1024" },
      parameters: {
        engine: "seedream",
        version: "v4.5",
        prompt: "A cat",
        quantity: 1,
        width: 1536,
        height: 1024,
      },
    },
  ] satisfies Array<{
    label: string;
    input: ImageGenerationInput;
    parameters: Record<string, unknown>;
  }>) {
    it.effect(label, () =>
      Effect.gen(function* () {
        let submissions = 0;
        const client = HttpClient.make((request) => {
          if (request.method === "POST") {
            submissions++;
            expect(request.body._tag).toBe("Uint8Array");
            if (request.body._tag === "Uint8Array") {
              expect(decodeJson(new TextDecoder().decode(request.body.body))).toEqual({
                currencies: [],
                externalId: expect.any(String),
                steps: [{ $type: "imageGen", input: parameters }],
              });
            }
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                Response.json({
                  id: "wf_test",
                  status: "succeeded",
                  steps: [
                    {
                      output: {
                        images: Array.from({ length: input.n ?? 1 }, () => ({
                          available: true,
                          url: "https://image.civitai.com/result.png",
                        })),
                      },
                    },
                  ],
                }),
              ),
            );
          }
          return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(png)));
        });
        const result = yield* generateCivitaiImage(client, "test-key", input);
        expect(result.data).toHaveLength(input.n ?? 1);
        expect(submissions).toBe(1);
      }),
    );
  }

  it.effect("maps Z-Image options and downloads without forwarding the key", () =>
    Effect.gen(function* () {
      const client = HttpClient.make((request) => {
        if (request.method === "POST") {
          expect(request.headers.authorization).toBe("Bearer test-key");
          expect(request.body._tag).toBe("Uint8Array");
          if (request.body._tag === "Uint8Array") {
            expect(decodeJson(new TextDecoder().decode(request.body.body))).toEqual({
              currencies: [],
              externalId: expect.any(String),
              steps: [
                {
                  $type: "imageGen",
                  input: {
                    engine: "sdcpp",
                    ecosystem: "zImage",
                    model: "turbo",
                    operation: "createImage",
                    prompt: "A cat",
                    width: 1536,
                    height: 1024,
                    quantity: 1,
                    seed: 42,
                  },
                },
              ],
            });
          }
          return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(succeeded())));
        }
        expect(request.headers.authorization).toBeUndefined();
        return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(png)));
      });
      const result = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/z-image-turbo",
        prompt: "A cat",
        size: "1536x1024",
        seed: 42,
      });
      expect(result.data).toEqual([
        { b64Json: Buffer.from(png).toString("base64"), mediaType: "image/png" },
      ]);
    }),
  );

  it.effect("rejects invalid options before submitting a paid workflow", () =>
    Effect.gen(function* () {
      const client = HttpClient.make(() => {
        throw new Error("Unexpected request");
      });
      for (const input of [
        { model: "civitai/unknown", prompt: "A cat" },
        { model: "civitai/flux2-pro", prompt: "x".repeat(1001) },
        { model: "civitai/z-image-base", prompt: "A cat", n: 5 },
        { model: "civitai/z-image-base", prompt: "A cat", size: "999x999" },
        { model: "civitai/google-nano-banana-2", prompt: "A cat", seed: 2147483648 },
        { model: "civitai/google-nano-banana-2", prompt: "A cat", size: "1024x1024" },
        { model: "civitai/google-nano-banana-2", prompt: "A cat", resolution: "8K" },
        { model: "civitai/openai-dall-e-3", prompt: "A cat", n: 2 },
        {
          model: "civitai/z-image-base",
          prompt: "A cat",
          inputReferences: [{ url: "https://example.com/a.png" }],
        },
      ]) {
        const result = yield* generateCivitaiImage(client, "test-key", input).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
      }
    }),
  );

  it.effect("does not expose upstream errors or retry rejected submissions", () =>
    Effect.gen(function* () {
      let requests = 0;
      const client = HttpClient.make((request) => {
        requests++;
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({ message: "secret-token" }, { status: 401 }),
          ),
        );
      });
      const result = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/z-image-base",
        prompt: "A cat",
      }).pipe(Effect.result);
      expect(requests).toBe(1);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.message).not.toContain("secret-token");
    }),
  );

  it.effect("rejects private or unrelated asset URLs before fetching them", () =>
    Effect.gen(function* () {
      let requests = 0;
      const client = HttpClient.make((request) => {
        requests++;
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, Response.json(succeeded("https://127.0.0.1/image"))),
        );
      });
      const result = yield* generateCivitaiImage(client, "test-key", {
        model: "civitai/flux2-dev",
        prompt: "A cat",
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      expect(requests).toBe(1);
    }),
  );
});
