import type { ImageGenerationModel, VideoGenerationModel } from "@t3tools/contracts";

const fluxSizes = [
  "square_hd",
  "square",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9",
] as const;

const bananaAspects = [
  "auto",
  "21:9",
  "16:9",
  "3:2",
  "4:3",
  "5:4",
  "1:1",
  "4:5",
  "3:4",
  "2:3",
  "9:16",
] as const;

export type FalImageSafety = "checker" | "tolerance" | "checker_and_tolerance";

export type FalLoraFormat = "path" | "model_name";

export type FalImageRoute = {
  endpoint: string;
  editEndpoint?: string;
  minPrompt: number;
  maxPrompt: number;
  maxReferences: number;
  safety: FalImageSafety;
  safetyTolerance?: "5" | "6";
  lora?: FalLoraFormat;
};

export type FalVideoRoute = {
  endpoint: string;
  minPrompt: number;
  maxPrompt: number;
  firstFrameField?: "image_url" | "start_image_url";
  lastFrameField?: "end_image_url";
  safetyChecker: boolean;
};

/** Reviewed fal endpoints; reference inputs select the corresponding image editing endpoint. */
export const FAL_IMAGE_MODELS: ReadonlyArray<ImageGenerationModel> = [
  {
    id: "fal/flux-2",
    name: "FLUX.2",
    group: "fal.ai",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    supportsStreaming: false,
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      input_references: { type: "range", min: 0, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      size: { type: "enum", values: [...fluxSizes] },
      output_format: { type: "enum", values: ["png", "jpeg", "webp"] },
    },
  },
  {
    id: "fal/flux-2-pro",
    name: "FLUX.2 Pro",
    group: "fal.ai",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    supportsStreaming: false,
    supportedParameters: {
      input_references: { type: "range", min: 0, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      size: { type: "enum", values: [...fluxSizes] },
      output_format: { type: "enum", values: ["jpeg", "png"] },
    },
  },
  {
    id: "fal/nano-banana-2",
    name: "Nano Banana 2",
    group: "fal.ai",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    supportsStreaming: false,
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      // Z3 caps references at four to bound upload size; this is not a fal API limit.
      input_references: { type: "range", min: 0, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      aspect_ratio: {
        type: "enum",
        values: [...bananaAspects, "4:1", "1:4", "8:1", "1:8"],
      },
      resolution: { type: "enum", values: ["0.5K", "1K", "2K", "4K"] },
      output_format: { type: "enum", values: ["png", "jpeg", "webp"] },
    },
  },
  {
    id: "fal/nano-banana-pro",
    name: "Nano Banana Pro",
    group: "fal.ai",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    supportsStreaming: false,
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      input_references: { type: "range", min: 0, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      aspect_ratio: { type: "enum", values: [...bananaAspects] },
      resolution: { type: "enum", values: ["1K", "2K", "4K"] },
      output_format: { type: "enum", values: ["png", "jpeg", "webp"] },
    },
  },
  {
    id: "fal/seedream-4",
    name: "Seedream 4.0",
    group: "fal.ai",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    supportsStreaming: false,
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      input_references: { type: "range", min: 0, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      size: {
        type: "enum",
        values: [
          "square_hd",
          "square",
          "portrait_4_3",
          "portrait_16_9",
          "landscape_4_3",
          "landscape_16_9",
          "auto",
          "auto_2K",
          "auto_4K",
        ],
      },
    },
  },
  {
    id: "fal/qwen-image",
    name: "Qwen Image",
    group: "fal.ai",
    inputModalities: ["text"],
    outputModalities: ["image"],
    supportsStreaming: false,
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      size: { type: "enum", values: [...fluxSizes] },
      output_format: { type: "enum", values: ["png", "jpeg"] },
    },
  },
  {
    id: "fal/flux-lora",
    name: "FLUX.1 [dev] · LoRA",
    group: "fal.ai",
    inputModalities: ["text"],
    outputModalities: ["image"],
    supportsStreaming: false,
    civitai: {
      checkpoint: "unsupported",
      ecosystems: ["Flux.1 D", "Flux.1 S"],
      maxLoras: 4,
      strength: { min: 0, max: 2 },
      negativePrompt: true,
      steps: { min: 1, max: 50 },
      cfgScale: { min: 0, max: 20 },
    },
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      size: { type: "enum", values: [...fluxSizes] },
      output_format: { type: "enum", values: ["jpeg", "png"] },
    },
  },
  {
    id: "fal/flux-krea-lora",
    name: "FLUX.1 Krea · LoRA",
    group: "fal.ai",
    inputModalities: ["text"],
    outputModalities: ["image"],
    supportsStreaming: false,
    civitai: {
      checkpoint: "unsupported",
      ecosystems: ["Flux.1 Krea"],
      maxLoras: 4,
      strength: { min: 0, max: 2 },
      negativePrompt: false,
      steps: { min: 1, max: 50 },
      cfgScale: { min: 0, max: 20 },
    },
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      size: { type: "enum", values: [...fluxSizes] },
      output_format: { type: "enum", values: ["jpeg", "png"] },
    },
  },
  {
    id: "fal/flux-2-lora",
    name: "FLUX.2 [dev] · LoRA",
    group: "fal.ai",
    inputModalities: ["text"],
    outputModalities: ["image"],
    supportsStreaming: false,
    civitai: {
      checkpoint: "unsupported",
      ecosystems: ["Flux.2 D"],
      maxLoras: 3,
      strength: { min: 0, max: 2 },
      negativePrompt: false,
      steps: { min: 1, max: 50 },
      cfgScale: { min: 0, max: 20 },
    },
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      size: { type: "enum", values: [...fluxSizes] },
      output_format: { type: "enum", values: ["png", "jpeg", "webp"] },
    },
  },
  {
    id: "fal/z-image-turbo-lora",
    name: "Z-Image Turbo · LoRA",
    group: "fal.ai",
    inputModalities: ["text"],
    outputModalities: ["image"],
    supportsStreaming: false,
    civitai: {
      checkpoint: "unsupported",
      ecosystems: ["ZImageTurbo"],
      maxLoras: 3,
      strength: { min: 0, max: 2 },
      negativePrompt: false,
      steps: { min: 1, max: 8 },
    },
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      size: { type: "enum", values: [...fluxSizes] },
      output_format: { type: "enum", values: ["png", "jpeg", "webp"] },
    },
  },
  {
    id: "fal/hidream-i1-full",
    name: "HiDream-I1 Full",
    group: "fal.ai",
    inputModalities: ["text"],
    outputModalities: ["image"],
    supportsStreaming: false,
    civitai: {
      checkpoint: "unsupported",
      ecosystems: ["HiDream-O1"],
      maxLoras: 3,
      strength: { min: 0, max: 2 },
      negativePrompt: true,
      steps: { min: 1, max: 50 },
      cfgScale: { min: 0, max: 20 },
    },
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      seed: { type: "range", min: 0, max: 2147483647 },
      size: { type: "enum", values: [...fluxSizes] },
      output_format: { type: "enum", values: ["jpeg", "png"] },
    },
  },
];

export const FAL_IMAGE_ROUTES: Record<string, FalImageRoute> = {
  "fal/flux-2": {
    endpoint: "fal-ai/flux-2",
    editEndpoint: "fal-ai/flux-2/edit",
    minPrompt: 1,
    maxPrompt: 50000,
    maxReferences: 4,
    safety: "checker",
  },
  "fal/flux-2-pro": {
    endpoint: "fal-ai/flux-2-pro",
    editEndpoint: "fal-ai/flux-2-pro/edit",
    minPrompt: 1,
    maxPrompt: 50000,
    maxReferences: 4,
    safety: "checker_and_tolerance",
    safetyTolerance: "5",
  },
  "fal/nano-banana-2": {
    endpoint: "fal-ai/nano-banana-2",
    editEndpoint: "fal-ai/nano-banana-2/edit",
    minPrompt: 3,
    maxPrompt: 50000,
    maxReferences: 4,
    safety: "tolerance",
    safetyTolerance: "6",
  },
  "fal/nano-banana-pro": {
    endpoint: "fal-ai/nano-banana-pro",
    editEndpoint: "fal-ai/nano-banana-pro/edit",
    minPrompt: 3,
    maxPrompt: 50000,
    maxReferences: 4,
    safety: "tolerance",
    safetyTolerance: "6",
  },
  "fal/seedream-4": {
    endpoint: "fal-ai/bytedance/seedream/v4/text-to-image",
    editEndpoint: "fal-ai/bytedance/seedream/v4/edit",
    minPrompt: 1,
    maxPrompt: 50000,
    maxReferences: 4,
    safety: "checker",
  },
  "fal/qwen-image": {
    endpoint: "fal-ai/qwen-image",
    minPrompt: 1,
    maxPrompt: 50000,
    maxReferences: 0,
    safety: "checker",
  },
  "fal/flux-lora": {
    endpoint: "fal-ai/flux-lora",
    minPrompt: 1,
    maxPrompt: 50000,
    maxReferences: 0,
    safety: "checker",
    lora: "path",
  },
  "fal/flux-krea-lora": {
    endpoint: "fal-ai/flux-krea-lora",
    minPrompt: 1,
    maxPrompt: 50000,
    maxReferences: 0,
    safety: "checker",
    lora: "path",
  },
  "fal/flux-2-lora": {
    endpoint: "fal-ai/flux-2/lora",
    minPrompt: 1,
    maxPrompt: 50000,
    maxReferences: 0,
    safety: "checker",
    lora: "path",
  },
  "fal/z-image-turbo-lora": {
    endpoint: "fal-ai/z-image/turbo/lora",
    minPrompt: 1,
    maxPrompt: 50000,
    maxReferences: 0,
    safety: "checker",
    lora: "model_name",
  },
  "fal/hidream-i1-full": {
    endpoint: "fal-ai/hidream-i1-full",
    minPrompt: 1,
    maxPrompt: 50000,
    maxReferences: 0,
    safety: "checker",
    lora: "path",
  },
};

export const FAL_VIDEO_MODELS: ReadonlyArray<VideoGenerationModel> = [
  {
    id: "fal/wan-2.6-text-to-video",
    name: "Wan 2.6 · Text to video (fal.ai)",
    generateAudio: false,
    supportsSeed: true,
    supportedDurations: [5, 10, 15],
    supportedResolutions: ["720p", "1080p"],
    supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    supportedFrameImages: [],
    supportedSizes: [],
    allowedPassthroughParameters: [],
    pricingSkus: {},
  },
  {
    id: "fal/wan-2.6-image-to-video",
    name: "Wan 2.6 · Image to video (fal.ai)",
    generateAudio: false,
    supportsSeed: true,
    supportedDurations: [5, 10, 15],
    supportedResolutions: ["720p", "1080p"],
    supportedAspectRatios: [],
    supportedFrameImages: ["first_frame"],
    requiredFrameImages: ["first_frame"],
    supportedSizes: [],
    allowedPassthroughParameters: [],
    pricingSkus: {},
  },
  {
    id: "fal/kling-3-pro-text-to-video",
    name: "Kling 3 Pro · Text to video (fal.ai)",
    generateAudio: true,
    supportsSeed: false,
    supportedDurations: [5, 10, 15],
    supportedResolutions: [],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedFrameImages: [],
    supportedSizes: [],
    allowedPassthroughParameters: [],
    pricingSkus: {},
  },
  {
    id: "fal/kling-3-pro-image-to-video",
    name: "Kling 3 Pro · Image to video (fal.ai)",
    generateAudio: true,
    supportsSeed: false,
    supportedDurations: [5, 10, 15],
    supportedResolutions: [],
    supportedAspectRatios: [],
    supportedFrameImages: ["first_frame", "last_frame"],
    requiredFrameImages: ["first_frame"],
    supportedSizes: [],
    allowedPassthroughParameters: [],
    pricingSkus: {},
  },
  {
    id: "fal/seedance-2-text-to-video",
    name: "Seedance 2.0 · Text to video (fal.ai)",
    generateAudio: true,
    supportsSeed: true,
    supportedDurations: [5, 10, 15],
    supportedResolutions: ["480p", "720p"],
    supportedAspectRatios: ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    supportedFrameImages: [],
    supportedSizes: [],
    allowedPassthroughParameters: [],
    pricingSkus: {},
  },
  {
    id: "fal/seedance-2-image-to-video",
    name: "Seedance 2.0 · Image to video (fal.ai)",
    generateAudio: true,
    supportsSeed: true,
    supportedDurations: [5, 10, 15],
    supportedResolutions: ["480p", "720p"],
    supportedAspectRatios: ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    supportedFrameImages: ["first_frame", "last_frame"],
    requiredFrameImages: ["first_frame"],
    supportedSizes: [],
    allowedPassthroughParameters: [],
    pricingSkus: {},
  },
];

export const FAL_VIDEO_ROUTES: Record<string, FalVideoRoute> = {
  "fal/wan-2.6-text-to-video": {
    endpoint: "wan/v2.6/text-to-video",
    minPrompt: 1,
    maxPrompt: 1500,
    safetyChecker: true,
  },
  "fal/wan-2.6-image-to-video": {
    endpoint: "wan/v2.6/image-to-video",
    minPrompt: 1,
    maxPrompt: 1500,
    firstFrameField: "image_url",
    safetyChecker: true,
  },
  "fal/kling-3-pro-text-to-video": {
    endpoint: "fal-ai/kling-video/v3/pro/text-to-video",
    minPrompt: 1,
    maxPrompt: 2500,
    safetyChecker: false,
  },
  "fal/kling-3-pro-image-to-video": {
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    minPrompt: 1,
    maxPrompt: 2500,
    firstFrameField: "start_image_url",
    lastFrameField: "end_image_url",
    safetyChecker: false,
  },
  "fal/seedance-2-text-to-video": {
    endpoint: "bytedance/seedance-2.0/text-to-video",
    minPrompt: 1,
    maxPrompt: 2500,
    safetyChecker: false,
  },
  "fal/seedance-2-image-to-video": {
    endpoint: "bytedance/seedance-2.0/image-to-video",
    minPrompt: 1,
    maxPrompt: 2500,
    firstFrameField: "image_url",
    lastFrameField: "end_image_url",
    safetyChecker: false,
  },
};

export function falImageRoute(modelId: string) {
  return FAL_IMAGE_ROUTES[modelId];
}

export function falVideoRoute(modelId: string) {
  return FAL_VIDEO_ROUTES[modelId];
}
