import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import {
  createFalVideo,
  downloadFalMedia,
  falImageRequest,
  falVideoRequest,
  fetchFalVideoJob,
  generateFalImage,
} from "./FalApi.ts";
import { FAL_IMAGE_MODELS, FAL_IMAGE_ROUTES, FAL_VIDEO_MODELS } from "./FalModels.ts";

const reference = "data:image/png;base64,iVBORw0KGgo=";
const queue = "https://queue.fal.run/wan/v2.6/requests/job-1";
const submission = {
  request_id: "job-1",
  status_url: `${queue}/status`,
  response_url: `${queue}/response`,
  cancel_url: `${queue}/cancel`,
};
const decodeJson = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);

describe("fal media integration", () => {
  it("uses each image endpoint's least restrictive documented safety setting", () => {
    for (const model of FAL_IMAGE_MODELS) {
      const route = FAL_IMAGE_ROUTES[model.id];
      const { body } = falImageRequest({ model: model.id, prompt: "A scene" });
      if (route.safety === "tolerance") {
        expect(body.safety_tolerance).toBe(route.safetyTolerance);
        expect(body).not.toHaveProperty("enable_safety_checker");
      } else if (route.safety === "checker_and_tolerance") {
        expect(body.enable_safety_checker).toBe(false);
        expect(body.safety_tolerance).toBe(route.safetyTolerance);
      } else {
        expect(body.enable_safety_checker).toBe(false);
        expect(body).not.toHaveProperty("safety_tolerance");
      }
    }
  });
  it("requests disabled checking only for Wan video modes", () => {
    for (const model of FAL_VIDEO_MODELS) {
      const { body } = falVideoRequest({
        model: model.id,
        prompt: "A scene",
        ...(model.requiredFrameImages?.length
          ? { frameImages: [{ frameType: "first_frame" as const, url: reference }] }
          : {}),
      });
      if (model.id.startsWith("fal/wan-")) {
        expect(body.enable_safety_checker).toBe(false);
      } else {
        expect(body).not.toHaveProperty("enable_safety_checker");
      }
      expect(body).not.toHaveProperty("safety_tolerance");
    }
  });
  it.effect("cancels an interrupted image job using fal's returned cancel URL", () =>
    Effect.gen(function* () {
      const polling = yield* Deferred.make<void>();
      const calls: string[] = [];
      const client = HttpClient.make((request) => {
        calls.push(`${request.method} ${request.url}`);
        if (request.method === "GET")
          return Deferred.succeed(polling, undefined).pipe(Effect.andThen(Effect.never));
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            request.method === "POST"
              ? Response.json(submission)
              : new Response(null, { status: 202 }),
          ),
        );
      });
      const fiber = yield* generateFalImage(client, "test-key", {
        model: "fal/flux-2",
        prompt: "A scene",
      }).pipe(Effect.forkChild);
      yield* Deferred.await(polling);
      yield* Fiber.interrupt(fiber);
      expect(calls).toContain(`PUT ${submission.cancel_url}`);
      expect(calls.filter((call) => call.startsWith("POST"))).toHaveLength(1);
    }),
  );
  it.effect("retries a rate-limited status read without submitting a second image job", () =>
    Effect.gen(function* () {
      const limited = yield* Deferred.make<void>();
      let submissions = 0;
      let polls = 0;
      const client = HttpClient.make((request) => {
        if (request.method === "POST") {
          submissions++;
          return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(submission)));
        }
        if (request.url === submission.status_url && polls++ === 0)
          return Deferred.succeed(limited, undefined).pipe(
            Effect.as(HttpClientResponse.fromWeb(request, new Response(null, { status: 429 }))),
          );
        if (request.url === submission.status_url)
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ status: "COMPLETED", response_url: submission.response_url }),
            ),
          );
        if (request.url === submission.response_url)
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ images: [{ url: "https://v3.fal.media/image.png" }] }),
            ),
          );
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
          ),
        );
      });
      const fiber = yield* generateFalImage(client, "test-key", {
        model: "fal/flux-2",
        prompt: "A scene",
      }).pipe(Effect.forkChild);
      yield* Deferred.await(limited);
      yield* TestClock.adjust("1 second");
      const result = yield* Fiber.join(fiber);
      expect(result.data).toHaveLength(1);
      expect(submissions).toBe(1);
      expect(polls).toBe(2);
    }),
  );
  for (const model of FAL_IMAGE_MODELS.filter((entry) => FAL_IMAGE_ROUTES[entry.id]?.editEndpoint)) {
    it(`routes ${model.id} references to the edit endpoint without modifying their bytes or order`, () => {
      const route = FAL_IMAGE_ROUTES[model.id];
      const plain = falImageRequest({ model: model.id, prompt: "A scene" });
      const edit = falImageRequest({
        model: model.id,
        prompt: "A scene",
        inputReferences: [{ url: reference }, { url: "https://example.com/ref.webp" }],
      });
      expect(plain.endpoint).toBe(route.endpoint);
      expect(edit.endpoint).toBe(route.editEndpoint);
      expect(edit.body.image_urls).toEqual([reference, "https://example.com/ref.webp"]);
      expect(plain.body.image_urls).toBeUndefined();
      expect(() =>
        falImageRequest({
          model: model.id,
          prompt: "A scene",
          inputReferences: Array.from({ length: 5 }, () => ({ url: reference })),
        }),
      ).toThrow("at most 4");
    });
  }
  it("maps model-specific options and rejects unsupported fields", () => {
    expect(
      falImageRequest({ model: "fal/flux-2", prompt: "A scene", size: "portrait_4_3", n: 2 }).body,
    ).toMatchObject({ image_size: "portrait_4_3", num_images: 2 });
    expect(
      falImageRequest({
        model: "fal/nano-banana-2",
        prompt: "A scene",
        resolution: "4K",
        aspectRatio: "16:9",
      }).body,
    ).toMatchObject({ resolution: "4K", aspect_ratio: "16:9" });
    expect(() =>
      falImageRequest({ model: "fal/flux-2", prompt: "A scene", resolution: "4K" }),
    ).toThrow("resolution");
    expect(() =>
      falImageRequest({
        model: "fal/flux-2",
        prompt: "A scene",
        inputReferences: [{ url: "blob:local-image" }],
      }),
    ).toThrow("references");
    expect(falImageRequest({ model: "fal/qwen-image", prompt: "A scene" }).endpoint).toBe(
      "fal-ai/qwen-image",
    );
    expect(() =>
      falImageRequest({
        model: "fal/qwen-image",
        prompt: "A scene",
        inputReferences: [{ url: reference }],
      }),
    ).toThrow("reference");
    expect(() =>
      falImageRequest({
        model: "fal/flux-2",
        prompt: "A scene",
        civitai: { loras: [{ air: "urn:air:flux1:lora:civitai:3@4", strength: 1 }] },
      }),
    ).toThrow("Civitai");
    expect(
      falImageRequest({
        model: "fal/flux-lora",
        prompt: "A scene",
        civitai: { steps: 28, cfgScale: 3.5, negativePrompt: "blur" },
      }).body,
    ).toMatchObject({
      num_inference_steps: 28,
      guidance_scale: 3.5,
      negative_prompt: "blur",
    });
  });
  it("maps Kling start frames and Seedance last frames to the documented fields", () => {
    expect(
      falVideoRequest({
        model: "fal/kling-3-pro-image-to-video",
        prompt: "A scene",
        duration: 10,
        frameImages: [
          { frameType: "first_frame", url: reference },
          { frameType: "last_frame", url: "https://example.com/end.png" },
        ],
      }),
    ).toEqual({
      endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
      body: {
        prompt: "A scene",
        duration: "10",
        start_image_url: reference,
        end_image_url: "https://example.com/end.png",
      },
    });
    expect(
      falVideoRequest({
        model: "fal/seedance-2-image-to-video",
        prompt: "A scene",
        generateAudio: false,
        frameImages: [{ frameType: "first_frame", url: reference }],
      }).body,
    ).toMatchObject({
      image_url: reference,
      generate_audio: false,
    });
  });
  it("requires exactly a supported first frame for image-to-video and maps duration to a string", () => {
    const input = { model: "fal/wan-2.6-image-to-video", prompt: "A scene", duration: 5 };
    expect(() => falVideoRequest(input)).toThrow("required frame");
    expect(
      falVideoRequest({ ...input, frameImages: [{ frameType: "first_frame", url: reference }] })
        .body,
    ).toEqual({
      prompt: "A scene",
      duration: "5",
      image_url: reference,
      enable_safety_checker: false,
    });
    expect(() =>
      falVideoRequest({ ...input, frameImages: [{ frameType: "last_frame", url: reference }] }),
    ).toThrow();
    expect(() =>
      falVideoRequest({
        model: "fal/wan-2.6-text-to-video",
        prompt: "A scene",
        frameImages: [{ frameType: "first_frame", url: reference }],
      }),
    ).toThrow();
  });
  it.effect(
    "submits an image edit, follows returned queue URLs, and downloads without credentials",
    () =>
      Effect.gen(function* () {
        const visited: string[] = [];
        const client = HttpClient.make((request) => {
          visited.push(request.url);
          let response: Response;
          if (request.method === "POST") {
            expect(request.url).toBe("https://queue.fal.run/fal-ai/flux-2/edit");
            expect(request.headers.authorization).toBe("Key test-key");
            expect(request.body._tag).toBe("Uint8Array");
            if (request.body._tag === "Uint8Array")
              expect(decodeJson(new TextDecoder().decode(request.body.body))).toMatchObject({
                image_urls: [reference],
              });
            response = Response.json(submission);
          } else if (request.url === submission.status_url)
            response = Response.json({
              status: "COMPLETED",
              response_url: submission.response_url,
            });
          else if (request.url === submission.response_url)
            response = Response.json({ images: [{ url: "https://v3.fal.media/generated.png" }] });
          else {
            expect(request.headers.authorization).toBeUndefined();
            response = new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
          }
          return Effect.succeed(HttpClientResponse.fromWeb(request, response));
        });
        const result = yield* generateFalImage(client, "test-key", {
          model: "fal/flux-2",
          prompt: "A scene",
          inputReferences: [{ url: reference }],
        });
        expect(result.data[0]?.mediaType).toBe("image/png");
        expect(visited).toHaveLength(4);
      }),
  );
  it.effect("preserves the supplied polling URL and reads a recovered video job", () =>
    Effect.gen(function* () {
      const client = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            request.method === "POST"
              ? Response.json(submission)
              : request.url === submission.status_url
                ? Response.json({ status: "COMPLETED", response_url: submission.response_url })
                : Response.json({ video: { url: "https://v3.fal.media/video.mp4" } }),
          ),
        ),
      );
      const job = yield* createFalVideo(client, "test-key", {
        model: "fal/wan-2.6-text-to-video",
        prompt: "A scene",
      });
      expect(job.pollingUrl).toBe(submission.status_url);
      const recovered = yield* fetchFalVideoJob(client, "test-key", job.id, job.pollingUrl!);
      expect(recovered.status).toBe("completed");
      expect(recovered.unsignedUrls).toEqual(["https://v3.fal.media/video.mp4"]);
    }),
  );
  it.effect("never retries a paid submission or exposes upstream error content", () =>
    Effect.gen(function* () {
      let calls = 0;
      const client = HttpClient.make((request) => {
        calls++;
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({ detail: "private input" }, { status: 503 }),
          ),
        );
      });
      const result = yield* createFalVideo(client, "test-key", {
        model: "fal/wan-2.6-text-to-video",
        prompt: "A scene",
      }).pipe(Effect.flip);
      expect(calls).toBe(1);
      expect(result.message).not.toContain("private input");
    }),
  );
  it.effect("rejects untrusted polling and media URLs before making a request", () =>
    Effect.gen(function* () {
      let calls = 0;
      const client = HttpClient.make((request) => {
        calls++;
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({})));
      });
      yield* fetchFalVideoJob(
        client,
        "test-key",
        "job-1",
        "https://other.example/requests/job/status",
      ).pipe(Effect.flip);
      yield* downloadFalMedia(client, "https://127.0.0.1/video.mp4", true).pipe(Effect.flip);
      expect(calls).toBe(0);
    }),
  );
});
