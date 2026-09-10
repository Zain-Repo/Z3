import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { VideoGenerationModel, videoGenerationInputError } from "@t3tools/contracts";
import { parseOpenRouterVideoModels } from "../provider/Layers/OpenRouterApi.ts";
import catalog from "./fixtures/openrouter-video-models.json" with { type: "json" };

const models = parseOpenRouterVideoModels(catalog);
const decodeVideoModel = Schema.decodeUnknownSync(VideoGenerationModel);

describe("OpenRouter video catalog compatibility", () => {
  it("preserves every live catalog entry and decodes its wire contract", () => {
    expect(models.map((model) => model.id)).toEqual(catalog.data.map((model) => model.id));
    for (const model of models) {
      expect(decodeVideoModel(model)).toEqual(model);
    }
  });

  it.each(models)("constructs non-conflicting default settings for $id", (model) => {
    const sourceVideo = model.upscaleFactor || model.id === "runway/aleph-2";
    const input = {
      model: model.id,
      prompt: "A slow cinematic camera movement",
      ...(model.supportedDurations[0] !== undefined
        ? { duration: model.supportedDurations[0] }
        : {}),
      ...(model.supportedResolutions[0] ? { resolution: model.supportedResolutions[0] } : {}),
      ...(model.supportedAspectRatios[0] ? { aspectRatio: model.supportedAspectRatios[0] } : {}),
      ...(sourceVideo
        ? { inputReferences: [{ type: "video_url" as const, url: "https://example.com/clip.mp4" }] }
        : {}),
      ...(model.id === "heygen/avatar-iv"
        ? {
            inputReferences: [
              { type: "image_url" as const, url: "https://example.com/portrait.png" },
            ],
          }
        : {}),
      ...(model.upscaleFactor ? { upscaleFactor: model.upscaleFactor.min } : {}),
    };
    expect(videoGenerationInputError(input, model)).toBeUndefined();
  });

  it("rejects settings that would cause avoidable provider failures", () => {
    const model = models.find((model) => model.id === "google/veo-3.1")!;
    const input = { model: model.id, prompt: "A forest" };
    for (const invalid of [
      { duration: 3 },
      { resolution: "480p" },
      { aspectRatio: "21:9" },
      { duration: 4, resolution: "1080p" },
      { duration: 6, size: "3840x2160" },
      { size: "1280x720", resolution: "1080p" },
      { seed: Number.MAX_SAFE_INTEGER + 1 },
      { frameImages: [{ frameType: "last_frame" as const, url: "https://example.com/last.png" }] },
      {
        frameImages: [{ frameType: "first_frame" as const, url: "https://example.com/first.png" }],
        inputReferences: [{ type: "image_url" as const, url: "https://example.com/ref.png" }],
      },
    ])
      expect(videoGenerationInputError({ ...input, ...invalid }, model)).toBeDefined();
  });

  it("accepts Veo high-resolution output at eight seconds", () => {
    const model = models.find((model) => model.id === "google/veo-3.1")!;
    expect(
      videoGenerationInputError(
        { model: model.id, prompt: "A forest", duration: 8, resolution: "1080p" },
        model,
      ),
    ).toBeUndefined();
  });

  it("requires the source media for editing, upscaling and avatar models", () => {
    for (const id of [
      "runway/aleph-2",
      "black-forest-labs/flux-video-upscale",
      "heygen/avatar-iv",
    ]) {
      const model = models.find((model) => model.id === id)!;
      expect(videoGenerationInputError({ model: id, prompt: "A scene" }, model)).toBeDefined();
    }
  });
});
