import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { parseDeepSeekModels, streamDeepSeekCompletion } from "./DeepSeekApi.ts";

describe("parseDeepSeekModels", () => {
  it("keeps valid DeepSeek model IDs and ignores malformed entries", () => {
    expect(
      parseDeepSeekModels({
        data: [
          { id: "deepseek-v4-flash", owned_by: "deepseek" },
          { id: " deepseek-v4-pro " },
          { name: "missing id" },
          null,
        ],
      }),
    ).toEqual([{ id: "deepseek-v4-flash" }, { id: "deepseek-v4-pro" }]);
  });

  it("returns an empty catalog for an unexpected response", () => {
    expect(parseDeepSeekModels({ data: "not-an-array" })).toEqual([]);
    expect(parseDeepSeekModels(null)).toEqual([]);
  });
});

describe("streamDeepSeekCompletion", () => {
  it.effect("parses DeepSeek SSE chunks without adding OpenRouter-only fields", () => {
    const encoder = new TextEncoder();
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"model":"deepseek-v4-flash","choices":[{"delta":{"reasoning_content":"Think","content":"Hello"}}]}\n\n',
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    let requestBody: unknown;
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body) requestBody = JSON.parse(new TextDecoder().decode(body.body)) as unknown;
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(responseBody, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        ),
      );
    });

    return streamDeepSeekCompletion({
      httpClient: client,
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "hello" }],
    }).pipe(
      Effect.flatMap((stream) => Stream.runCollect(stream)),
      Effect.map((chunks) => {
        expect(requestBody).toEqual({
          model: "deepseek-v4-flash",
          messages: [{ role: "user", content: "hello" }],
          stream: true,
        });
        expect(Array.from(chunks)).toEqual([
          {
            delta: "Hello",
            done: false,
            model: "deepseek-v4-flash",
            reasoningDelta: "Think",
          },
          { delta: "", done: true },
        ]);
      }),
    );
  });
});
