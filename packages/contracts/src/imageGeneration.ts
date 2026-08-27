import * as Schema from "effect/Schema";
import { ProviderInstanceId } from "./providerInstance.ts";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const OPENROUTER_GPT_IMAGE_2_MODEL = "openai/gpt-image-2";
export const OPENROUTER_GPT_IMAGE_2_PROVIDER = "openai";

export const ImageGenerationParameterDescriptor = Schema.Union([
  Schema.Struct({ type: Schema.Literal("boolean") }),
  Schema.Struct({ type: Schema.Literal("enum"), values: Schema.Array(TrimmedNonEmptyString) }),
  Schema.Struct({ type: Schema.Literal("range"), min: Schema.Number, max: Schema.Number }),
]);
export type ImageGenerationParameterDescriptor = typeof ImageGenerationParameterDescriptor.Type;

export const ImageGenerationPricingLine = Schema.Struct({
  billable: TrimmedNonEmptyString,
  unit: TrimmedNonEmptyString,
  costUsd: Schema.Number,
  variant: Schema.optionalKey(Schema.String),
});
export type ImageGenerationPricingLine = typeof ImageGenerationPricingLine.Type;

export const ImageGenerationModel = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: Schema.optionalKey(TrimmedNonEmptyString),
  inputModalities: Schema.Array(TrimmedNonEmptyString),
  outputModalities: Schema.Array(TrimmedNonEmptyString),
  supportedParameters: Schema.Record(TrimmedNonEmptyString, ImageGenerationParameterDescriptor),
  supportsStreaming: Schema.Boolean,
});
export type ImageGenerationModel = typeof ImageGenerationModel.Type;

export const ImageGenerationModelCatalog = Schema.Struct({
  models: Schema.Array(ImageGenerationModel),
});
export type ImageGenerationModelCatalog = typeof ImageGenerationModelCatalog.Type;

export const ImageGenerationModelEndpoint = Schema.Struct({
  providerName: Schema.optionalKey(TrimmedNonEmptyString),
  providerSlug: Schema.optionalKey(TrimmedNonEmptyString),
  providerTag: Schema.optionalKey(TrimmedNonEmptyString),
  allowedPassthroughParameters: Schema.Array(TrimmedNonEmptyString),
  supportedParameters: Schema.Record(TrimmedNonEmptyString, ImageGenerationParameterDescriptor),
  supportsStreaming: Schema.Boolean,
  pricing: Schema.Array(ImageGenerationPricingLine),
});
export type ImageGenerationModelEndpoint = typeof ImageGenerationModelEndpoint.Type;

export const ImageGenerationModelEndpoints = Schema.Struct({
  id: TrimmedNonEmptyString,
  endpoints: Schema.Array(ImageGenerationModelEndpoint),
});
export type ImageGenerationModelEndpoints = typeof ImageGenerationModelEndpoints.Type;

export const ImageGenerationInput = Schema.Struct({
  providerInstanceId: Schema.optionalKey(ProviderInstanceId),
  model: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  stream: Schema.optionalKey(Schema.Boolean),
  n: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(10)),
  ),
  resolution: Schema.optionalKey(TrimmedNonEmptyString),
  aspectRatio: Schema.optionalKey(TrimmedNonEmptyString),
  size: Schema.optionalKey(TrimmedNonEmptyString),
  quality: Schema.optionalKey(Schema.Literals(["auto", "low", "medium", "high"])),
  outputFormat: Schema.optionalKey(Schema.Literals(["png", "jpeg", "webp", "svg"])),
  background: Schema.optionalKey(Schema.Literals(["auto", "transparent", "opaque"])),
  outputCompression: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(100)),
  ),
  seed: Schema.optionalKey(Schema.Int),
  inputReferences: Schema.optionalKey(Schema.Array(Schema.Struct({ url: TrimmedNonEmptyString }))),
  provider: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});
export type ImageGenerationInput = typeof ImageGenerationInput.Type;

export const ImageGenerationAsset = Schema.Struct({
  id: TrimmedNonEmptyString,
  mediaType: TrimmedNonEmptyString,
  sizeBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  revisedPrompt: Schema.optionalKey(Schema.String),
  createdAt: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
});
export type ImageGenerationAsset = typeof ImageGenerationAsset.Type;

export const ImageGenerationAssetContent = Schema.Struct({
  mediaType: TrimmedNonEmptyString,
  data: TrimmedNonEmptyString,
});
export type ImageGenerationAssetContent = typeof ImageGenerationAssetContent.Type;

export const ImageGenerationRecord = Schema.Struct({
  id: TrimmedNonEmptyString,
  model: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  input: Schema.optionalKey(ImageGenerationInput),
  createdAt: TrimmedNonEmptyString,
  completedAt: Schema.optionalKey(TrimmedNonEmptyString),
  usage: Schema.optionalKey(Schema.Unknown),
  assets: Schema.Array(ImageGenerationAsset),
});
export type ImageGenerationRecord = typeof ImageGenerationRecord.Type;

export const ImageGenerationList = Schema.Struct({
  generations: Schema.Array(ImageGenerationRecord),
});
export type ImageGenerationList = typeof ImageGenerationList.Type;
