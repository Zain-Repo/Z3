import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import {
  createOpenRouterVideo,
  downloadOpenRouterVideo,
} from "../provider/Layers/OpenRouterApi.ts";

describe("video API request compatibility", () => {
  it.effect(
    "sends upscaling, references, false audio, zero creativity and provider options intact",
    () => {
      let payload: unknown;
      const client = HttpClient.make((request) => {
        if (request.body._tag === "Uint8Array")
          payload = JSON.parse(new TextDecoder().decode(request.body.body));
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, Response.json({ id: "job", status: "pending" })),
        );
      });
      return createOpenRouterVideo({
        httpClient: client,
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "test-key",
        model: "black-forest-labs/flux-video-upscale",
        prompt: "Enhance the scene",
        upscaleFactor: 2,
        creativity: 0,
        generateAudio: false,
        inputReferences: [
          { type: "video_url", video_url: { url: "https://example.com/source.mp4" } },
        ],
        provider: { options: { "black-forest-labs": { safety_tolerance: 2 } } },
      }).pipe(
        Effect.map(() => {
          expect(payload).toEqual({
            model: "black-forest-labs/flux-video-upscale",
            prompt: "Enhance the scene",
            upscale_factor: 2,
            creativity: 0,
            generate_audio: false,
            input_references: [
              { type: "video_url", video_url: { url: "https://example.com/source.mp4" } },
            ],
            provider: { options: { "black-forest-labs": { safety_tolerance: 2 } } },
          });
        }),
      );
    },
  );

  it.effect("does not save a successful HTTP response containing an error page as a video", () => {
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response("<html>Unavailable</html>", { headers: { "content-type": "text/html" } }),
        ),
      ),
    );
    return downloadOpenRouterVideo({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      jobId: "job",
    }).pipe(
      Effect.flip,
      Effect.map((error) => {
        expect(error.message).toContain("non-video content");
      }),
    );
  });
});
