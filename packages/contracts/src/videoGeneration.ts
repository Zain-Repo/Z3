import * as Schema from "effect/Schema";

import { ProviderInstanceId } from "./providerInstance.ts";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const VideoGenerationStatus = Schema.Literals([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
  "expired",
]);
export type VideoGenerationStatus = typeof VideoGenerationStatus.Type;

export const VideoGenerationModel = Schema.Struct({
  id: TrimmedNonEmptyString,
  canonicalSlug: Schema.optionalKey(TrimmedNonEmptyString),
  name: Schema.optionalKey(TrimmedNonEmptyString),
  description: Schema.optionalKey(Schema.String),
  generateAudio: Schema.Boolean,
  supportsSeed: Schema.Boolean,
  supportedDurations: Schema.Array(Schema.Int),
  supportedResolutions: Schema.Array(TrimmedNonEmptyString),
  supportedAspectRatios: Schema.Array(TrimmedNonEmptyString),
  supportedFrameImages: Schema.Array(Schema.Literals(["first_frame", "last_frame"])),
  supportedSizes: Schema.Array(TrimmedNonEmptyString),
  allowedPassthroughParameters: Schema.Array(TrimmedNonEmptyString),
  pricingSkus: Schema.Record(TrimmedNonEmptyString, Schema.Unknown),
  upscaleFactor: Schema.optionalKey(Schema.Struct({ min: Schema.Number, max: Schema.Number })),
  creativity: Schema.optionalKey(Schema.Array(Schema.Int)),
});
export type VideoGenerationModel = typeof VideoGenerationModel.Type;

export const VideoGenerationModelCatalog = Schema.Struct({
  models: Schema.Array(VideoGenerationModel),
});
export type VideoGenerationModelCatalog = typeof VideoGenerationModelCatalog.Type;

export const VideoGenerationAsset = Schema.Struct({
  id: TrimmedNonEmptyString,
  mediaType: TrimmedNonEmptyString,
  sizeBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  createdAt: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
});
export type VideoGenerationAsset = typeof VideoGenerationAsset.Type;

export const VideoGenerationRecord = Schema.Struct({
  id: TrimmedNonEmptyString,
  providerJobId: TrimmedNonEmptyString,
  model: TrimmedNonEmptyString,
  prompt: Schema.optionalKey(Schema.String),
  status: VideoGenerationStatus,
  createdAt: TrimmedNonEmptyString,
  updatedAt: TrimmedNonEmptyString,
  completedAt: Schema.optionalKey(TrimmedNonEmptyString),
  error: Schema.optionalKey(Schema.String),
  usage: Schema.optionalKey(Schema.Unknown),
  assets: Schema.Array(VideoGenerationAsset),
});
export type VideoGenerationRecord = typeof VideoGenerationRecord.Type;

export const VideoGenerationList = Schema.Struct({
  generations: Schema.Array(VideoGenerationRecord),
});
export type VideoGenerationList = typeof VideoGenerationList.Type;

const VideoReferenceType = Schema.Literals(["image_url", "audio_url", "video_url"]);

export const VideoGenerationInput = Schema.Struct({
  providerInstanceId: Schema.optionalKey(ProviderInstanceId),
  model: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  duration: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  resolution: Schema.optionalKey(TrimmedNonEmptyString),
  aspectRatio: Schema.optionalKey(TrimmedNonEmptyString),
  size: Schema.optionalKey(TrimmedNonEmptyString),
  generateAudio: Schema.optionalKey(Schema.Boolean),
  seed: Schema.optionalKey(Schema.Int),
  upscaleFactor: Schema.optionalKey(Schema.Number.check(Schema.isGreaterThan(0))),
  creativity: Schema.optionalKey(Schema.Int),
  frameImages: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        url: TrimmedNonEmptyString,
        frameType: Schema.Literals(["first_frame", "last_frame"]),
      }),
    ),
  ),
  inputReferences: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        type: VideoReferenceType,
        url: TrimmedNonEmptyString,
      }),
    ),
  ),
  provider: Schema.optionalKey(
    Schema.Struct({
      options: Schema.Record(TrimmedNonEmptyString, Schema.Record(Schema.String, Schema.Unknown)),
    }),
  ),
  callbackUrl: Schema.optionalKey(Schema.String),
});
export type VideoGenerationInput = typeof VideoGenerationInput.Type;

/** Checks catalog capabilities before a potentially billable video submission. */
export function videoGenerationInputError(
  input: VideoGenerationInput,
  model: VideoGenerationModel,
): string | undefined {
  if (input.model !== model.id) return "Choose an available video model.";
  for (const [label, value, supported] of [
    ["Duration", input.duration, model.supportedDurations],
    ["Resolution", input.resolution, model.supportedResolutions],
    ["Aspect ratio", input.aspectRatio, model.supportedAspectRatios],
    ["Size", input.size, model.supportedSizes],
  ] as const) {
    if (value !== undefined && !supported.some((option) => option === value)) {
      return `${label} is not supported by ${model.name ?? model.id}.`;
    }
  }
  if (input.size && (input.resolution || input.aspectRatio)) {
    return "Choose either pixel size or resolution and aspect ratio.";
  }
  if (input.seed !== undefined && (!model.supportsSeed || !Number.isSafeInteger(input.seed))) {
    return "This model requires a supported integer seed or no seed.";
  }
  if (input.generateAudio !== undefined && !model.generateAudio) {
    return "This model does not support audio generation settings.";
  }
  const frames = input.frameImages ?? [];
  if (frames.some((frame) => !model.supportedFrameImages.includes(frame.frameType))) {
    return "The selected model does not support one of the frame images.";
  }
  if (new Set(frames.map((frame) => frame.frameType)).size !== frames.length) {
    return "Use only one first frame and one last frame.";
  }
  if (frames.length && input.inputReferences?.length) {
    return "Use frame images or reference assets in one generation.";
  }
  if (
    input.upscaleFactor !== undefined &&
    (!model.upscaleFactor ||
      !Number.isFinite(input.upscaleFactor) ||
      input.upscaleFactor < model.upscaleFactor.min ||
      input.upscaleFactor > model.upscaleFactor.max)
  ) {
    return "Choose an upscale factor within the model's supported range.";
  }
  if (input.creativity !== undefined && !model.creativity?.includes(input.creativity)) {
    return "Choose a supported creativity level.";
  }
  const references = input.inputReferences ?? [];
  // Veo's resolution and reference constraints are not expressed by the catalog's independent lists.
  if (["google/veo-3.1", "google/veo-3.1-fast", "google/veo-3.1-lite"].includes(model.id)) {
    if (
      frames.some((frame) => frame.frameType === "last_frame") &&
      !frames.some((frame) => frame.frameType === "first_frame")
    ) {
      return "Add a first frame when using a Veo last frame.";
    }
    const imageCount = references.filter((reference) => reference.type === "image_url").length;
    const highResolution =
      input.resolution === "1080p" ||
      input.resolution === "4K" ||
      (input.size !== undefined && Math.min(...input.size.split("x").map(Number)) >= 1080);
    if ((highResolution || imageCount > 0) && input.duration !== 8) {
      return "Veo requires an 8-second duration for high resolution or reference images.";
    }
    if (imageCount > 3) return "Veo supports at most three reference images.";
    if (model.id === "google/veo-3.1-lite" && imageCount > 0) {
      return "Veo 3.1 Lite supports frame images, not reference images.";
    }
  }
  for (const [slug, options] of Object.entries(input.provider?.options ?? {})) {
    const parameters = slug === "google-vertex" ? options.parameters : options;
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
      return "Provider options must contain a parameter object.";
    }
    const unsupported = Object.keys(parameters).filter(
      (key) => !model.allowedPassthroughParameters.includes(key),
    );
    if (unsupported.length) return `Unsupported provider option: ${unsupported.join(", ")}.`;
  }
  // These video-output models operate on existing media rather than text alone.
  if (
    (model.upscaleFactor || model.id === "runway/aleph-2") &&
    references.filter((reference) => reference.type === "video_url").length !== 1
  ) {
    return "This model requires one source video URL.";
  }
  if (
    model.id === "heygen/avatar-iv" &&
    references.filter((reference) => reference.type === "image_url").length !== 1
  ) {
    return "Avatar IV requires one reference portrait image.";
  }
  return undefined;
}
