import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { parseOpenRouterModels, streamOpenRouterCompletion } from "./OpenRouterApi.ts";

describe("parseOpenRouterModels", () => {
  it("keeps valid OpenRouter model IDs and ignores malformed entries", () => {
    const models = parseOpenRouterModels({
      data: [
        { id: "openai/gpt-4o-mini", name: "GPT-4o mini", context_length: 128000 },
        { id: " anthropic/claude-3.7-sonnet " },
        { name: "missing id" },
        null,
      ],
    });

    expect(models).toEqual([
      { id: "openai/gpt-4o-mini", name: "GPT-4o mini", contextLength: 128000 },
      { id: "anthropic/claude-3.7-sonnet" },
    ]);
  });

  it("returns an empty catalog for an unexpected response", () => {
    expect(parseOpenRouterModels({ data: "not-an-array" })).toEqual([]);
    expect(parseOpenRouterModels(null)).toEqual([]);
  });
});

describe("streamOpenRouterCompletion", () => {
  it.effect("parses SSE chunks incrementally across transport boundaries", () => {
    const encoder = new TextEncoder();
    const bodyChunks = [
      'data: {"model":"openai/test","choices":[{"delta":{"content":"Hel"}}]}\r\n',
      '\r\ndata: {"choices":[{"delta":{"content":"lo "}}]}\n\ndata: {"choices":[{"delta":{"content":"world"}}],"usage":{"total_tokens":3}}\n',
      'data: [DONE]\n\n',
    ].map((chunk) => encoder.encode(chunk));
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of bodyChunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(responseBody, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        ),
      ),
    );

    return streamOpenRouterCompletion({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "openai/test",
      messages: [{ role: "user", content: "hello" }],
    }).pipe(
      Effect.flatMap((stream) => Stream.runCollect(stream)),
      Effect.map((chunks) => Array.from(chunks)),
      Effect.map((chunks) => {
        expect(chunks).toEqual([
          { delta: "Hel", done: false, model: "openai/test" },
          { delta: "lo ", done: false },
          { delta: "world", done: false, usage: { total_tokens: 3 } },
          { delta: "", done: true },
        ]);
      }),
    );
  });
});
