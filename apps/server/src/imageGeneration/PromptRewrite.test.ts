import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { rewriteImagePrompt } from "./PromptRewrite.ts";

const connection = { baseUrl: "https://openrouter.ai/api/v1/", apiKey: "test-key" };
const decodeRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      model: Schema.String,
      stream: Schema.Boolean,
      max_completion_tokens: Schema.Number,
      messages: Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.String })),
    }),
  ),
);

it.effect("rewrites with a bounded text completion and preserves refinement instructions", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) => {
      assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(request.body._tag, "Uint8Array");
      if (request.body._tag === "Uint8Array") {
        const body = decodeRequest(new TextDecoder().decode(request.body.body));
        assert.equal(body.model, "openrouter/auto");
        assert.equal(body.stream, false);
        assert.equal(body.max_completion_tokens, 2048);
        assert.include(body.messages[1]?.content, "A blue cup");
        assert.include(body.messages[1]?.content, "Use daylight");
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json({
            choices: [
              {
                finish_reason: "stop",
                message: { content: "  A blue ceramic cup in soft daylight.  " },
              },
            ],
          }),
        ),
      );
    });
    const result = yield* rewriteImagePrompt(client, connection, {
      prompt: "A blue cup",
      instructions: "Use daylight",
    });
    assert.equal(result.prompt, "A blue ceramic cup in soft daylight.");
  }),
);

for (const [name, status, body, message] of [
  ["rate limit", 429, {}, "rate limiting"],
  ["credentials", 401, { error: "secret-provider-details" }, "API key"],
  ["malformed response", 200, {}, "invalid prompt"],
  [
    "empty completion",
    200,
    { choices: [{ finish_reason: "stop", message: { content: " " } }] },
    "empty or oversized",
  ],
  [
    "truncated completion",
    200,
    { choices: [{ finish_reason: "length", message: { content: "A partial" } }] },
    "did not complete",
  ],
] as const) {
  it.effect(`rejects ${name} without returning unusable output`, () =>
    Effect.gen(function* () {
      const client = HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(body, { status }))),
      );
      const error = yield* rewriteImagePrompt(client, connection, { prompt: "A cup" }).pipe(
        Effect.flip,
      );
      assert.include(error.message, message);
      assert.notInclude(error.message, "secret-provider-details");
    }),
  );
}

it.effect("rejects oversized input before contacting the provider", () =>
  Effect.gen(function* () {
    let requests = 0;
    const client = HttpClient.make((request) => {
      requests++;
      return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({})));
    });
    yield* rewriteImagePrompt(client, connection, { prompt: "x".repeat(10001) }).pipe(Effect.flip);
    assert.equal(requests, 0);
  }),
);
