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
  prompt: Schema.optionalKey(Schema.String),
  duration: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  resolution: Schema.optionalKey(TrimmedNonEmptyString),
  aspectRatio: Schema.optionalKey(TrimmedNonEmptyString),
  size: Schema.optionalKey(TrimmedNonEmptyString),
  generateAudio: Schema.optionalKey(Schema.Boolean),
  seed: Schema.optionalKey(Schema.Int),
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
  provider: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  callbackUrl: Schema.optionalKey(Schema.String),
});
export type VideoGenerationInput = typeof VideoGenerationInput.Type;
