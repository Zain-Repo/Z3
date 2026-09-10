import type { ImageGenerationModel, CivitaiImageCapabilities } from "@t3tools/contracts";
import { CIVITAI_REALISTIC_CHECKPOINTS } from "./CivitaiRealisticCheckpoints.ts";

export interface CivitaiModelDefinition {
  id: string;
  name: string;
  group: string;
  routing: Readonly<Record<string, string>>;
  supportedParameters: ImageGenerationModel["supportedParameters"];
  parameterMap: Partial<
    Record<
      "n" | "size" | "aspectRatio" | "resolution" | "quality" | "outputFormat" | "seed",
      string
    >
  >;
  maxPrompt: number;
  defaults?: Readonly<Record<string, unknown>>;
}

/** Match the route's LoRA wire format, rather than assuming all Civitai engines agree. */
export function civitaiLoraFormat(recipe: CivitaiModelDefinition): "array" | "dictionary" {
  return recipe.routing.engine === "wan" ||
    (recipe.routing.engine === "flux2" && recipe.routing.model === "dev")
    ? "array"
    : "dictionary";
}

/** Resource support follows the route schemas and the site's exact BaseModel names. */
export function civitaiCapabilities(
  recipe: CivitaiModelDefinition,
): CivitaiImageCapabilities | undefined {
  const { engine, ecosystem, model, modelVersion } = recipe.routing;
  if (engine === "wan") {
    // Later Wan inputs inherit `loras`, but verified FAL LoRA execution is A14B only:
    // https://fal.ai/models/fal-ai/wan/v2.2-a14b/text-to-image/lora/api/
    const families: Record<string, string[]> = {
      "v2.2": ["Wan Video 2.2 T2V-A14B"],
    };
    const ecosystems = families[recipe.routing.version ?? ""];
    if (!ecosystems) return undefined;
    return {
      checkpoint: "unsupported",
      ecosystems,
      maxLoras: 10,
      strength: { min: 0, max: 4 },
      negativePrompt: true,
      steps: { min: 2, max: 40 },
      cfgScale: { min: 1, max: 10 },
    };
  }
  if (engine === "flux2" && model === "dev")
    return {
      checkpoint: "unsupported",
      ecosystems: ["Flux.2 D"],
      maxLoras: 10,
      strength: { min: 0, max: 4 },
      negativePrompt: false,
      steps: { min: 4, max: 50 },
      cfgScale: { min: 0, max: 20 },
    };
  if (engine !== "comfy" && engine !== "sdcpp" && !(engine === "flux2" && model === "klein"))
    return undefined;
  const family = engine === "flux2" ? "flux2Klein" : ecosystem;
  const families: Record<string, readonly string[]> = {
    sd1: ["SD 1.5"],
    sdxl: [
      "SDXL 1.0",
      "SDXL 1.0 LCM",
      "SDXL Lightning",
      "SDXL Hyper",
      "SDXL Turbo",
      "SDXL Distilled",
      "Pony",
      "Illustrious",
      "NoobAI",
    ],
    flux1: ["Flux.1 D", "Flux.1 S", "Flux.1 Krea"],
    zImage: [model === "turbo" ? "ZImageTurbo" : "ZImageBase"],
    anima: ["Anima"],
    "hidream-o1": ["HiDream-O1"],
    krea2: ["Krea 2"],
    ernie: ["Ernie"],
    ideogram4: ["Ideogram 4.0"],
    lens: ["Lens"],
    boogu: ["Boogu"],
    mageflow: ["MageFlow"],
    qwen: ["Qwen"],
    flux2Dev: ["Flux.2 D"],
    flux2Klein: [
      `Flux.2 Klein ${modelVersion?.startsWith("9b") ? "9B" : "4B"}${modelVersion?.endsWith("-base") ? "-base" : ""}`,
    ],
  };
  const ecosystems = families[family ?? ""];
  if (!ecosystems) return undefined;
  const flux2 = family === "flux2Dev" || family === "flux2Klein";
  return {
    checkpoint: ["sd1", "sdxl", "flux1"].includes(ecosystem ?? "")
      ? "required"
      : ["zImage", "anima"].includes(ecosystem ?? "")
        ? "optional"
        : "unsupported",
    ecosystems,
    recommendedCheckpoints: CIVITAI_REALISTIC_CHECKPOINTS.filter((checkpoint) =>
      ecosystems.includes(checkpoint.baseModel),
    ),
    // Application limits bound request cost and make multiple-resource composition reviewable.
    maxLoras: 10,
    strength: { min: -2, max: 2 },
    negativePrompt: ecosystem !== "flux1",
    steps: { min: flux2 ? 4 : 1, max: flux2 ? 50 : 150 },
    cfgScale: { min: flux2 ? 1 : 0, max: flux2 ? 20 : 30 },
  };
}

// Reviewed against https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml
// Keep this catalog static: remote schema changes must be reviewed before exposing paid routes.
// ZImage's count limit is ten; the upstream workers allow twelve.
const zTurboOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    size: { type: "enum", values: ["1024x1024", "1536x1024", "1024x1536", "1280x720", "720x1280"] },
    seed: { type: "range", min: 0, max: 9007199254740991 },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", size: "dimensions", outputFormat: "outputFormat", seed: "seed" },
  maxPrompt: 10000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const flux2KleinOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    size: { type: "enum", values: ["1024x1024", "1536x1024", "1024x1536", "1280x720", "720x1280"] },
    seed: { type: "range", min: 0, max: 9007199254740991 },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", size: "dimensions", outputFormat: "outputFormat", seed: "seed" },
  maxPrompt: 1000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const animaOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 10 },
    size: { type: "enum", values: ["1024x1024", "1536x1024", "1024x1536", "1280x720", "720x1280"] },
    seed: { type: "range", min: 0, max: 9007199254740991 },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", size: "dimensions", outputFormat: "outputFormat", seed: "seed" },
  maxPrompt: 10000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const krea2FalOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 10 },
    size: { type: "enum", values: ["medium", "large"] },
    seed: { type: "range", min: 0, max: 2147483647 },
    aspect_ratio: {
      type: "enum",
      values: ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: {
    n: "quantity",
    size: "size",
    aspectRatio: "aspectRatio",
    outputFormat: "outputFormat",
    seed: "seed",
  },
  maxPrompt: 5000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const maiFalOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    aspect_ratio: {
      type: "enum",
      values: ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", aspectRatio: "aspectRatio", outputFormat: "outputFormat" },
  maxPrompt: 5000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const museFalOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 10 },
    aspect_ratio: {
      type: "enum",
      values: ["auto", "21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", aspectRatio: "aspectRatio", outputFormat: "outputFormat" },
  maxPrompt: 4000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const qwen2FalOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 10 },
    size: {
      type: "enum",
      values: [
        "square_hd",
        "square",
        "portrait_4_3",
        "portrait_16_9",
        "landscape_4_3",
        "landscape_16_9",
      ],
    },
    seed: { type: "range", min: 0, max: 2147483647 },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", size: "imageSize", outputFormat: "outputFormat", seed: "seed" },
  maxPrompt: 100000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const reveFalOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 10 },
    aspect_ratio: {
      type: "enum",
      values: [
        "auto",
        "4:1",
        "3:1",
        "21:9",
        "2:1",
        "17:9",
        "16:9",
        "3:2",
        "4:3",
        "5:4",
        "1:1",
        "4:5",
        "3:4",
        "2:3",
        "9:16",
        "1:2",
        "1:3",
        "1:4",
      ],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", aspectRatio: "aspectRatio", outputFormat: "outputFormat" },
  maxPrompt: 4000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const flux1KontextDevOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    seed: { type: "range", min: 0, max: 9007199254740991 },
    aspect_ratio: {
      type: "enum",
      values: ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: {
    n: "quantity",
    aspectRatio: "aspectRatio",
    outputFormat: "outputFormat",
    seed: "seed",
  },
  maxPrompt: 1000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const gemini25FlashOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", outputFormat: "outputFormat" },
  maxPrompt: 100000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const imagen4Options = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    seed: { type: "range", min: 0, max: 9007199254740991 },
    aspect_ratio: { type: "enum", values: ["1:1", "16:9", "9:16", "3:4", "4:3"] },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: {
    n: "numImages",
    aspectRatio: "aspectRatio",
    outputFormat: "outputFormat",
    seed: "seed",
  },
  maxPrompt: 1000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const nanoBanana2Options = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    resolution: { type: "enum", values: ["1K", "2K", "4K"] },
    seed: { type: "range", min: 0, max: 2147483647 },
    aspect_ratio: {
      type: "enum",
      values: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: {
    n: "numImages",
    aspectRatio: "aspectRatio",
    resolution: "resolution",
    outputFormat: "outputFormat",
    seed: "seed",
  },
  maxPrompt: 50000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const nanoBanana2LiteOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    seed: { type: "range", min: 0, max: 2147483647 },
    aspect_ratio: {
      type: "enum",
      values: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: {
    n: "numImages",
    aspectRatio: "aspectRatio",
    outputFormat: "outputFormat",
    seed: "seed",
  },
  maxPrompt: 50000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const nanoBananaProOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    resolution: { type: "enum", values: ["1K", "2K", "4K"] },
    aspect_ratio: {
      type: "enum",
      values: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: {
    n: "numImages",
    aspectRatio: "aspectRatio",
    resolution: "resolution",
    outputFormat: "outputFormat",
  },
  maxPrompt: 50000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const grokOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    aspect_ratio: {
      type: "enum",
      values: [
        "2:1",
        "20:9",
        "19.5:9",
        "16:9",
        "4:3",
        "3:2",
        "1:1",
        "2:3",
        "3:4",
        "9:16",
        "9:19.5",
        "9:20",
        "1:2",
      ],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", aspectRatio: "aspectRatio", outputFormat: "outputFormat" },
  maxPrompt: 100000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const grokV2Options = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    resolution: { type: "enum", values: ["1k", "2k"] },
    quality: { type: "enum", values: ["low", "medium"] },
    aspect_ratio: {
      type: "enum",
      values: [
        "2:1",
        "20:9",
        "19.5:9",
        "16:9",
        "4:3",
        "3:2",
        "1:1",
        "2:3",
        "3:4",
        "9:16",
        "9:19.5",
        "9:20",
        "1:2",
      ],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: {
    n: "quantity",
    aspectRatio: "aspectRatio",
    resolution: "resolution",
    quality: "quality",
    outputFormat: "outputFormat",
  },
  maxPrompt: 100000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const kreaOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 10 },
    seed: { type: "range", min: 0, max: 2147483647 },
    aspect_ratio: {
      type: "enum",
      values: ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
    },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: {
    n: "quantity",
    aspectRatio: "aspectRatio",
    outputFormat: "outputFormat",
    seed: "seed",
  },
  maxPrompt: 5000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const openAIDallE2Options = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 10 },
    size: { type: "enum", values: ["256x256", "512x512", "1024x1024"] },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", size: "size", outputFormat: "outputFormat" },
  maxPrompt: 1000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const openAIDallE3Options = {
  supportedParameters: {
    size: { type: "enum", values: ["1024x1024", "1792x1024", "1024x1792"] },
    quality: { type: "enum", values: ["auto"] },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { size: "size", quality: "quality", outputFormat: "outputFormat" },
  maxPrompt: 4000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const openAIGpt1Options = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 10 },
    size: { type: "enum", values: ["1024x1024", "1536x1024", "1024x1536"] },
    quality: { type: "enum", values: ["auto", "high", "medium", "low"] },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", size: "size", quality: "quality", outputFormat: "outputFormat" },
  maxPrompt: 32000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const openAIGpt15Options = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    size: { type: "enum", values: ["1024x1024", "1536x1024", "1024x1536"] },
    quality: { type: "enum", values: ["low", "medium", "high"] },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", size: "size", quality: "quality", outputFormat: "outputFormat" },
  maxPrompt: 32000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const openAIGpt2Options = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    size: { type: "enum", values: ["1024x1024", "1536x1024", "1024x1536", "1280x720", "720x1280"] },
    quality: { type: "enum", values: ["low", "medium", "high"] },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: {
    n: "quantity",
    size: "dimensions",
    quality: "quality",
    outputFormat: "outputFormat",
  },
  maxPrompt: 32000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const openAIGpt25FlareOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    size: { type: "enum", values: ["1024x1024", "1536x1024", "1024x1536", "1280x720", "720x1280"] },
    quality: { type: "enum", values: ["low", "medium", "high", "xhigh", "max"] },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: {
    n: "quantity",
    size: "dimensions",
    quality: "quality",
    outputFormat: "outputFormat",
  },
  maxPrompt: 32000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const qwenApiOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 6 },
    size: { type: "enum", values: ["1024x1024", "1536x1024", "1024x1536", "1280x720", "720x1280"] },
    seed: { type: "range", min: 0, max: 2147483647 },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", size: "dimensions", outputFormat: "outputFormat", seed: "seed" },
  maxPrompt: 5000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const seedreamOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 10 },
    size: { type: "enum", values: ["1024x1024", "1536x1024", "1024x1536", "1280x720", "720x1280"] },
    seed: { type: "range", min: 0, max: 2147483647 },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", size: "dimensions", outputFormat: "outputFormat", seed: "seed" },
  maxPrompt: 100000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

const wan22FalOptions = {
  supportedParameters: {
    n: { type: "range", min: 1, max: 10 },
    seed: { type: "range", min: 0, max: 2147483647 },
    output_format: { type: "enum", values: ["png", "jpeg"] },
  },
  parameterMap: { n: "quantity", outputFormat: "outputFormat", seed: "seed" },
  maxPrompt: 100000,
} satisfies Pick<CivitaiModelDefinition, "supportedParameters" | "parameterMap" | "maxPrompt">;

export const CIVITAI_MODELS: readonly CivitaiModelDefinition[] = [
  // ZImageTurboCreateImageGenInput
  {
    ...zTurboOptions,
    id: "civitai/z-image-turbo",
    name: "Z-Image Turbo",
    group: "Civitai workers",
    routing: { engine: "sdcpp", ecosystem: "zImage", model: "turbo", operation: "createImage" },
    defaults: { width: 1024, height: 1024 },
  },
  // ZImageBaseCreateImageGenInput
  {
    ...zTurboOptions,
    id: "civitai/z-image-base",
    name: "Z-Image Base",
    group: "Civitai workers",
    routing: { engine: "sdcpp", ecosystem: "zImage", model: "base", operation: "createImage" },
    defaults: { width: 1024, height: 1024 },
  },
  // Flux2KleinCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/flux2-klein-4b",
    name: "FLUX.2 Klein 4B",
    group: "FLUX",
    routing: { engine: "flux2", model: "klein", operation: "createImage", modelVersion: "4b" },
    defaults: { width: 1024, height: 1024 },
  },
  // Flux2KleinCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/flux2-klein-9b",
    name: "FLUX.2 Klein 9B",
    group: "FLUX",
    routing: { engine: "flux2", model: "klein", operation: "createImage", modelVersion: "9b" },
    defaults: { width: 1024, height: 1024 },
  },
  // Flux2DevCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/flux2-dev",
    name: "FLUX.2 Dev",
    group: "FLUX",
    routing: { engine: "flux2", model: "dev", operation: "createImage" },
    defaults: { width: 1024, height: 1024 },
  },
  // Flux2FlexCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/flux2-flex",
    name: "FLUX.2 Flex",
    group: "FLUX",
    routing: { engine: "flux2", model: "flex", operation: "createImage" },
    defaults: { width: 1024, height: 1024 },
  },
  // Flux2ProCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/flux2-pro",
    name: "FLUX.2 Pro",
    group: "FLUX",
    routing: { engine: "flux2", model: "pro", operation: "createImage" },
    defaults: { width: 1024, height: 1024 },
  },
  // Flux2MaxCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/flux2-max",
    name: "FLUX.2 Max",
    group: "FLUX",
    routing: { engine: "flux2", model: "max", operation: "createImage" },
    defaults: { width: 1024, height: 1024 },
  },
  // AnimaCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/sdcpp-anima",
    name: "Anima",
    group: "Civitai workers",
    routing: { engine: "sdcpp", ecosystem: "anima", operation: "createImage" },
  },
  // Flux2DevSdCppCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/sdcpp-flux2Dev",
    name: "FLUX.2 Dev",
    group: "Civitai workers",
    routing: { engine: "sdcpp", ecosystem: "flux2Dev", operation: "createImage" },
  },
  // Flux2KleinSdCppCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/sdcpp-flux2Klein-4b",
    name: "FLUX.2 Klein 4B",
    group: "Civitai workers",
    routing: {
      engine: "sdcpp",
      ecosystem: "flux2Klein",
      operation: "createImage",
      modelVersion: "4b",
    },
  },
  // Flux2KleinSdCppCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/sdcpp-flux2Klein-4b-base",
    name: "FLUX.2 Klein 4B Base",
    group: "Civitai workers",
    routing: {
      engine: "sdcpp",
      ecosystem: "flux2Klein",
      operation: "createImage",
      modelVersion: "4b-base",
    },
  },
  // Flux2KleinSdCppCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/sdcpp-flux2Klein-9b",
    name: "FLUX.2 Klein 9B",
    group: "Civitai workers",
    routing: {
      engine: "sdcpp",
      ecosystem: "flux2Klein",
      operation: "createImage",
      modelVersion: "9b",
    },
  },
  // Flux2KleinSdCppCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/sdcpp-flux2Klein-9b-base",
    name: "FLUX.2 Klein 9B Base",
    group: "Civitai workers",
    routing: {
      engine: "sdcpp",
      ecosystem: "flux2Klein",
      operation: "createImage",
      modelVersion: "9b-base",
    },
  },
  // Qwen20bCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/sdcpp-qwen-20b-2509",
    name: "Qwen 20B 2509",
    group: "Civitai workers",
    routing: {
      engine: "sdcpp",
      ecosystem: "qwen",
      model: "20b",
      operation: "createImage",
      version: "2509",
    },
  },
  // Qwen20bCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/sdcpp-qwen-20b-2512",
    name: "Qwen 20B 2512",
    group: "Civitai workers",
    routing: {
      engine: "sdcpp",
      ecosystem: "qwen",
      model: "20b",
      operation: "createImage",
      version: "2512",
    },
  },
  // Qwen20bCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/sdcpp-qwen-20b-latest",
    name: "Qwen 20B Latest",
    group: "Civitai workers",
    routing: {
      engine: "sdcpp",
      ecosystem: "qwen",
      model: "20b",
      operation: "createImage",
      version: "latest",
    },
  },
  // ComfyAnimaCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-anima",
    name: "Anima",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "anima", operation: "createImage" },
  },
  // ComfyBooguBaseCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-boogu-base",
    name: "Boogu Base",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "boogu", model: "base", operation: "createImage" },
  },
  // ComfyBooguTurboCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-boogu-turbo",
    name: "Boogu Turbo",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "boogu", model: "turbo", operation: "createImage" },
  },
  // ComfyErnieStandardCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-ernie-ernie",
    name: "ERNIE",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "ernie", model: "ernie", operation: "createImage" },
  },
  // ComfyErnieTurboCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-ernie-turbo",
    name: "ERNIE Turbo",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "ernie", model: "turbo", operation: "createImage" },
  },
  // ComfyFlux2DevCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/comfy-flux2Dev",
    name: "FLUX.2 Dev",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "flux2Dev", operation: "createImage" },
  },
  // ComfyFlux2KleinCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/comfy-flux2Klein-4b",
    name: "FLUX.2 Klein 4B",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "flux2Klein",
      operation: "createImage",
      modelVersion: "4b",
    },
  },
  // ComfyFlux2KleinCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/comfy-flux2Klein-4b-base",
    name: "FLUX.2 Klein 4B Base",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "flux2Klein",
      operation: "createImage",
      modelVersion: "4b-base",
    },
  },
  // ComfyFlux2KleinCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/comfy-flux2Klein-9b",
    name: "FLUX.2 Klein 9B",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "flux2Klein",
      operation: "createImage",
      modelVersion: "9b",
    },
  },
  // ComfyFlux2KleinCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/comfy-flux2Klein-9b-base",
    name: "FLUX.2 Klein 9B Base",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "flux2Klein",
      operation: "createImage",
      modelVersion: "9b-base",
    },
  },
  // ComfyFlux2KleinCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/comfy-flux2Klein-9b-kv",
    name: "FLUX.2 Klein 9B KV",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "flux2Klein",
      operation: "createImage",
      modelVersion: "9b-kv",
    },
  },
  // ComfyHiDreamO1CreateImageGenInput
  {
    ...zTurboOptions,
    id: "civitai/comfy-hidream-o1-HiDream-O1-Image",
    name: "HiDream O1 Image",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "hidream-o1",
      model: "HiDream-O1-Image",
      operation: "createImage",
    },
  },
  // ComfyHiDreamO1DevCreateImageGenInput
  {
    ...zTurboOptions,
    id: "civitai/comfy-hidream-o1-HiDream-O1-Image-dev",
    name: "HiDream O1 Image Dev",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "hidream-o1",
      model: "HiDream-O1-Image-dev",
      operation: "createImage",
    },
  },
  // ComfyIdeogram4CreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-ideogram4",
    name: "Ideogram 4",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "ideogram4", operation: "createImage" },
  },
  // ComfyKrea2RawCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-krea2-raw",
    name: "Krea 2 Raw",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "krea2", model: "raw", operation: "createImage" },
  },
  // ComfyKrea2TurboCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-krea2-turbo",
    name: "Krea 2 Turbo",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "krea2", model: "turbo", operation: "createImage" },
  },
  // ComfyLensNormalCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-lens-normal",
    name: "Lens Normal",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "lens", model: "normal", operation: "createImage" },
  },
  // ComfyLensTurboCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-lens-turbo",
    name: "Lens Turbo",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "lens", model: "turbo", operation: "createImage" },
  },
  // ComfyMageFlow4bCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-mageflow-4b",
    name: "MageFlow 4B",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "mageflow", model: "4b", operation: "createImage" },
    defaults: { cfgScale: 5, quantity: 1, steps: 20 },
  },
  // ComfyMageFlow4bTurboCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-mageflow-4b-turbo",
    name: "MageFlow 4B Turbo",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "mageflow",
      model: "4b-turbo",
      operation: "createImage",
    },
    defaults: { cfgScale: 1, quantity: 1, steps: 4 },
  },
  // ComfyQwen20bCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-qwen-20b-2509",
    name: "Qwen 20B 2509",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "qwen",
      model: "20b",
      operation: "createImage",
      version: "2509",
    },
  },
  // ComfyQwen20bCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-qwen-20b-2512",
    name: "Qwen 20B 2512",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "qwen",
      model: "20b",
      operation: "createImage",
      version: "2512",
    },
  },
  // ComfyQwen20bCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-qwen-20b-latest",
    name: "Qwen 20B Latest",
    group: "ComfyUI",
    routing: {
      engine: "comfy",
      ecosystem: "qwen",
      model: "20b",
      operation: "createImage",
      version: "latest",
    },
  },
  // ComfyZImageBaseCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-zImage-base",
    name: "Z-Image Base",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "zImage", model: "base", operation: "createImage" },
  },
  // ComfyZImageTurboCreateImageGenInput
  {
    ...animaOptions,
    id: "civitai/comfy-zImage-turbo",
    name: "Z-Image Turbo",
    group: "ComfyUI",
    routing: { engine: "comfy", ecosystem: "zImage", model: "turbo", operation: "createImage" },
  },
  // Krea2CreateFalImageGenInput
  {
    ...krea2FalOptions,
    id: "civitai/fal-krea2",
    name: "Krea 2",
    group: "FAL",
    routing: { engine: "fal", model: "krea2", operation: "createImage" },
    defaults: { imageStyleReferences: [] },
  },
  // MaiImageCreateFalImageGenInput
  {
    ...maiFalOptions,
    id: "civitai/fal-maiImage",
    name: "MAI Image",
    group: "FAL",
    routing: { engine: "fal", model: "maiImage", operation: "createImage" },
  },
  // MuseImageCreateFalImageGenInput
  {
    ...museFalOptions,
    id: "civitai/fal-museImage",
    name: "Muse Image",
    group: "FAL",
    routing: { engine: "fal", model: "museImage", operation: "createImage" },
  },
  // Qwen2CreateFalImageGenInput
  {
    ...qwen2FalOptions,
    id: "civitai/fal-qwen2",
    name: "Qwen 2",
    group: "FAL",
    routing: { engine: "fal", model: "qwen2", operation: "createImage" },
  },
  // Qwen2ProCreateFalImageGenInput
  {
    ...qwen2FalOptions,
    id: "civitai/fal-qwen2-pro",
    name: "Qwen 2 Pro",
    group: "FAL",
    routing: { engine: "fal", model: "qwen2", operation: "proCreateImage" },
  },
  // ReveCreateFalImageGenInput
  {
    ...reveFalOptions,
    id: "civitai/fal-reve",
    name: "Reve",
    group: "FAL",
    routing: { engine: "fal", model: "reve", operation: "createImage" },
  },
  // Flux1KontextDevImageGenInput
  {
    ...flux1KontextDevOptions,
    id: "civitai/flux1-kontext-dev",
    name: "FLUX.1 Kontext Dev",
    group: "FLUX",
    routing: { engine: "flux1-kontext", model: "dev" },
  },
  // Flux1KontextMaxImageGenInput
  {
    ...flux1KontextDevOptions,
    id: "civitai/flux1-kontext-max",
    name: "FLUX.1 Kontext Max",
    group: "FLUX",
    routing: { engine: "flux1-kontext", model: "max" },
  },
  // Flux1KontextProImageGenInput
  {
    ...flux1KontextDevOptions,
    id: "civitai/flux1-kontext-pro",
    name: "FLUX.1 Kontext Pro",
    group: "FLUX",
    routing: { engine: "flux1-kontext", model: "pro" },
  },
  // Flux2KleinCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/flux2-klein-4b-base",
    name: "FLUX.2 Klein 4B Base",
    group: "FLUX",
    routing: { engine: "flux2", model: "klein", operation: "createImage", modelVersion: "4b-base" },
    defaults: { width: 1024, height: 1024 },
  },
  // Flux2KleinCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/flux2-klein-9b-base",
    name: "FLUX.2 Klein 9B Base",
    group: "FLUX",
    routing: { engine: "flux2", model: "klein", operation: "createImage", modelVersion: "9b-base" },
    defaults: { width: 1024, height: 1024 },
  },
  // Flux2KleinCreateImageInput
  {
    ...flux2KleinOptions,
    id: "civitai/flux2-klein-9b-kv",
    name: "FLUX.2 Klein 9B KV",
    group: "FLUX",
    routing: { engine: "flux2", model: "klein", operation: "createImage", modelVersion: "9b-kv" },
    defaults: { width: 1024, height: 1024 },
  },
  // Gemini25FlashCreateImageGenInput
  {
    ...gemini25FlashOptions,
    id: "civitai/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    group: "Gemini",
    routing: { engine: "gemini", model: "2.5-flash", operation: "createImage" },
  },
  // Imagen4ImageGenInput
  {
    ...imagen4Options,
    id: "civitai/google-imagen4",
    name: "Imagen 4",
    group: "Google",
    routing: { engine: "google", model: "imagen4" },
  },
  // NanoBanana2ImageGenInput
  {
    ...nanoBanana2Options,
    id: "civitai/google-nano-banana-2",
    name: "Nano Banana 2",
    group: "Google",
    routing: { engine: "google", model: "nano-banana-2" },
  },
  // NanoBanana2LiteImageGenInput
  {
    ...nanoBanana2LiteOptions,
    id: "civitai/google-nano-banana-2-lite",
    name: "Nano Banana 2 Lite",
    group: "Google",
    routing: { engine: "google", model: "nano-banana-2-lite" },
  },
  // NanoBananaProImageGenInput
  {
    ...nanoBananaProOptions,
    id: "civitai/google-nano-banana-pro",
    name: "Nano Banana Pro",
    group: "Google",
    routing: { engine: "google", model: "nano-banana-pro" },
  },
  // GrokCreateImageGenInput
  {
    ...grokOptions,
    id: "civitai/grok-v1.0",
    name: "Grok v1.0",
    group: "Grok",
    routing: { engine: "grok", version: "v1.0", operation: "createImage" },
  },
  // GrokV2CreateImageGenInput
  {
    ...grokV2Options,
    id: "civitai/grok-v2.0",
    name: "Grok v2.0",
    group: "Grok",
    routing: { engine: "grok", version: "v2.0", operation: "createImage" },
  },
  // KreaCreateImageGenInput
  {
    ...kreaOptions,
    id: "civitai/krea-krea2-large",
    name: "Krea 2 Large",
    group: "Krea",
    routing: { engine: "krea", operation: "createImage", model: "krea2-large" },
    defaults: { imageStyleReferences: [] },
  },
  // KreaCreateImageGenInput
  {
    ...kreaOptions,
    id: "civitai/krea-krea2-medium",
    name: "Krea 2 Medium",
    group: "Krea",
    routing: { engine: "krea", operation: "createImage", model: "krea2-medium" },
    defaults: { imageStyleReferences: [] },
  },
  // KreaCreateImageGenInput
  {
    ...kreaOptions,
    id: "civitai/krea-krea2-medium-turbo",
    name: "Krea 2 Medium Turbo",
    group: "Krea",
    routing: { engine: "krea", operation: "createImage", model: "krea2-medium-turbo" },
    defaults: { imageStyleReferences: [] },
  },
  // OpenAIDallE2CreateImageGenInput
  {
    ...openAIDallE2Options,
    id: "civitai/openai-dall-e-2",
    name: "DALL-E 2",
    group: "OpenAI",
    routing: { engine: "openai", model: "dall-e-2", operation: "createImage" },
    defaults: { size: "1024x1024" },
  },
  // OpenAIDallE3CreateImageGenInput
  {
    ...openAIDallE3Options,
    id: "civitai/openai-dall-e-3",
    name: "DALL-E 3",
    group: "OpenAI",
    routing: { engine: "openai", model: "dall-e-3", operation: "createImage" },
    defaults: { size: "1024x1024" },
  },
  // OpenAIGpt1CreateImageInput
  {
    ...openAIGpt1Options,
    id: "civitai/openai-gpt-image-1",
    name: "GPT Image 1",
    group: "OpenAI",
    routing: { engine: "openai", model: "gpt-image-1", operation: "createImage" },
  },
  // OpenAIGpt15CreateImageInput
  {
    ...openAIGpt15Options,
    id: "civitai/openai-gpt-image-1.5",
    name: "GPT Image 1.5",
    group: "OpenAI",
    routing: { engine: "openai", model: "gpt-image-1.5", operation: "createImage" },
  },
  // OpenAIGpt2CreateImageInput
  {
    ...openAIGpt2Options,
    id: "civitai/openai-gpt-image-2",
    name: "GPT Image 2",
    group: "OpenAI",
    routing: { engine: "openai", model: "gpt-image-2", operation: "createImage" },
  },
  // OpenAIGpt25FlareCreateImageInput
  {
    ...openAIGpt25FlareOptions,
    id: "civitai/openai-gpt-image-2.5-flare",
    name: "GPT Image 2.5 Flare",
    group: "OpenAI",
    routing: { engine: "openai", model: "gpt-image-2.5-flare", operation: "createImage" },
  },
  // OpenAIGpt25SunburstCreateImageInput
  {
    ...openAIGpt25FlareOptions,
    id: "civitai/openai-gpt-image-2.5-sunburst",
    name: "GPT Image 2.5 Sunburst",
    group: "OpenAI",
    routing: { engine: "openai", model: "gpt-image-2.5-sunburst", operation: "createImage" },
  },
  // QwenApiCreateImageGenInput
  {
    ...qwenApiOptions,
    id: "civitai/qwen-2.0",
    name: "Qwen 2.0",
    group: "Qwen",
    routing: { engine: "qwen", operation: "createImage", model: "2.0" },
    defaults: { width: 1024, height: 1024 },
  },
  // QwenApiCreateImageGenInput
  {
    ...qwenApiOptions,
    id: "civitai/qwen-2.0-pro",
    name: "Qwen 2.0 Pro",
    group: "Qwen",
    routing: { engine: "qwen", operation: "createImage", model: "2.0-pro" },
    defaults: { width: 1024, height: 1024 },
  },
  // QwenApiCreateImageGenInput
  {
    ...qwenApiOptions,
    id: "civitai/qwen-3.0-pro",
    name: "Qwen 3.0 Pro",
    group: "Qwen",
    routing: { engine: "qwen", operation: "createImage", model: "3.0-pro" },
    defaults: { width: 1024, height: 1024 },
  },
  // QwenApiCreateImageGenInput
  {
    ...qwenApiOptions,
    id: "civitai/qwen-max",
    name: "Qwen Max",
    group: "Qwen",
    routing: { engine: "qwen", operation: "createImage", model: "max" },
    defaults: { width: 1024, height: 1024 },
  },
  // QwenApiCreateImageGenInput
  {
    ...qwenApiOptions,
    id: "civitai/qwen-plus",
    name: "Qwen Plus",
    group: "Qwen",
    routing: { engine: "qwen", operation: "createImage", model: "plus" },
    defaults: { width: 1024, height: 1024 },
  },
  // SeedreamImageGenInput
  {
    ...seedreamOptions,
    id: "civitai/seedream-v3",
    name: "Seedream v3",
    group: "Seedream",
    routing: { engine: "seedream", version: "v3" },
  },
  // SeedreamImageGenInput
  {
    ...seedreamOptions,
    id: "civitai/seedream-v4",
    name: "Seedream v4",
    group: "Seedream",
    routing: { engine: "seedream", version: "v4" },
  },
  // SeedreamImageGenInput
  {
    ...seedreamOptions,
    id: "civitai/seedream-v4.5",
    name: "Seedream v4.5",
    group: "Seedream",
    routing: { engine: "seedream", version: "v4.5" },
  },
  // SeedreamImageGenInput
  {
    ...seedreamOptions,
    id: "civitai/seedream-v5.0-lite",
    name: "Seedream v5.0 Lite",
    group: "Seedream",
    routing: { engine: "seedream", version: "v5.0-lite" },
  },
  // SeedreamImageGenInput
  {
    ...seedreamOptions,
    id: "civitai/seedream-v5.0-pro",
    name: "Seedream v5.0 Pro",
    group: "Seedream",
    routing: { engine: "seedream", version: "v5.0-pro" },
  },
  // Wan22FalImageGenInput
  {
    ...wan22FalOptions,
    id: "civitai/wan-v2.2",
    name: "Wan v2.2",
    group: "Wan",
    routing: { engine: "wan", version: "v2.2", provider: "fal" },
  },
  // Wan225bFalImageGenInput
  {
    ...wan22FalOptions,
    id: "civitai/wan-v2.2-5b",
    name: "Wan v2.2 5B",
    group: "Wan",
    routing: { engine: "wan", version: "v2.2-5b", provider: "fal" },
  },
  // Wan25FalTextToImageInput
  {
    ...wan22FalOptions,
    id: "civitai/wan-v2.5",
    name: "Wan v2.5",
    group: "Wan",
    routing: { engine: "wan", version: "v2.5", provider: "fal", operation: "text-to-image" },
  },
  // Wan27FalTextToImageInput
  {
    ...wan22FalOptions,
    id: "civitai/wan-v2.7",
    name: "Wan v2.7",
    group: "Wan",
    routing: { engine: "wan", version: "v2.7", provider: "fal", operation: "createImage" },
  },
  ...["sd1", "sdxl", "flux1"].map(
    (ecosystem): CivitaiModelDefinition => ({
      id: `civitai/comfy-${ecosystem}-checkpoint`,
      name: `${ecosystem === "sd1" ? "Stable Diffusion 1.5" : ecosystem === "sdxl" ? "SDXL / Pony / Illustrious" : "FLUX.1"} — custom checkpoint`,
      group: "Community checkpoints",
      routing: { engine: "comfy", ecosystem, operation: "createImage" },
      supportedParameters: {
        n: { type: "range", min: 1, max: 10 },
        size: {
          type: "enum",
          values:
            ecosystem === "sd1"
              ? ["512x512", "512x768", "768x512", "1024x1024"]
              : ["1024x1024", "1536x1024", "1024x1536", "1280x720", "720x1280"],
        },
        seed: { type: "range", min: 0, max: Number.MAX_SAFE_INTEGER },
        output_format: { type: "enum", values: ["png", "jpeg"] },
      },
      parameterMap: {
        n: "quantity",
        size: "dimensions",
        seed: "seed",
        outputFormat: "outputFormat",
      },
      defaults: {
        width: ecosystem === "sd1" ? 512 : 1024,
        height: ecosystem === "sd1" ? 512 : 1024,
      },
      maxPrompt: 10000,
    }),
  ),
];
