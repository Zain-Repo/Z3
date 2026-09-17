import type { ImageCreativeDirection, ImageGenerationInput } from "@t3tools/contracts";

export const DEFAULT_IMAGE_DIRECTION: ImageCreativeDirection = {
  version: 1,
  style: "faithful",
  lighting: "auto",
  composition: "auto",
  detail: "natural",
  referenceRole: "auto",
};

export const IMAGE_STYLE_PRESETS = [
  { id: "faithful", label: "As described", description: "Keep the medium and mood in your brief." },
  {
    id: "photographic",
    label: "Photographic",
    description: "Lifelike materials and natural texture.",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Film stills with deliberate depth and color.",
  },
  { id: "product", label: "Product", description: "Precise surfaces and commercial composition." },
  {
    id: "illustration",
    label: "Illustration",
    description: "Intentional shapes and a coherent palette.",
  },
] as const;

const STYLE: Record<ImageCreativeDirection["style"], string> = {
  faithful: "",
  photographic:
    "Photographic rendering with believable proportions, lifelike surface texture, subtle material imperfections, and physically coherent reflections.",
  cinematic:
    "A cinematic film still with deliberate color grading, grounded spatial depth, and a clear visual focal point.",
  product:
    "Commercial product photography with faithful geometry, precise material finishes, controlled reflections, and clearly resolved product details.",
  illustration:
    "An intentional illustration with coherent shape language, confident edges, and a considered color palette.",
};
const LIGHTING: Record<ImageCreativeDirection["lighting"], string> = {
  auto: "",
  daylight: "Soft daylight with a consistent light direction and gentle shadow transitions.",
  studio: "A large diffused studio key light, restrained fill, and controlled specular highlights.",
  "golden-hour":
    "Low, warm evening sunlight with long, coherent shadows and softly lit highlights.",
  dramatic: "Directional light with deep readable shadows and a carefully exposed focal subject.",
};
const COMPOSITION: Record<ImageCreativeDirection["composition"], string> = {
  auto: "",
  portrait:
    "An eye-level portrait composition with natural perspective and room around the subject.",
  wide: "An establishing composition with a clear foreground, middle ground, and background.",
  "close-up":
    "A close detail composition with the focal surface sharply resolved and a gradual focus falloff.",
  "copy-space": "A balanced composition with intentional empty space for later text placement.",
};
const REFERENCE: Record<ImageCreativeDirection["referenceRole"], string> = {
  auto: "Use the attached references according to the brief.",
  subject:
    "Use the attached references for subject identity and defining geometry; follow the brief for the new setting and treatment.",
  style:
    "Use the attached references for palette, texture, and visual treatment; use the subject described in the brief.",
  composition:
    "Use the attached references for framing and spatial arrangement; use the subject and medium described in the brief.",
};

export function imagePromptFamily(model: string): "descriptive" | "instruction" {
  return /flux|z[-_]?image|stable[-_]?diffusion|sdxl/i.test(model) ? "descriptive" : "instruction";
}

/** Compact image-model guidance from .agents/skills/zimage-realism/SKILL.md. */
export const ZIMAGE_REALISM_RULES =
  "Honor the brief's explicit medium, style, subjects, identity, skin tone, age, text, and reference intent. For photographic imagery, use believable scene lighting with consistent shadows and reflections; when lighting is unspecified, favor natural available light appropriate to the setting. Where skin is visible, render a clear complexion with subtle pores, fine texture, gentle tonal variation, and restrained highlights at the scale of the shot. Preserve distinguishing features and natural asymmetry, with restrained retouching. Keep anatomy, object geometry, contact shadows, material surfaces, perspective, and focus falloff coherent. Let texture remain subtle and specific to each material. Apply these photographic cues only where compatible with the requested medium; preserve intentional stylization.";

/** Version 1 direction is shared by preview and server; the original brief stays reusable. */
export function prepareImagePrompt(input: ImageGenerationInput): string {
  const direction = input.creativeDirection;
  if (!direction) return `${input.prompt}\n\n${ZIMAGE_REALISM_RULES}`;
  const cues = [
    ZIMAGE_REALISM_RULES,
    STYLE[direction.style],
    direction.realism === "natural"
      ? "Natural camera rendering: plausible lens perspective, coherent anatomy and object geometry, subtle surface variation, realistic skin texture where visible, and balanced highlight rolloff. Keep the subject and styling from the brief."
      : direction.realism === "editorial"
        ? "Editorial camera rendering: deliberate focal-plane sharpness, optically plausible depth of field, realistic fabric and skin texture where visible, consistent contact shadows and reflections, and restrained retouching. Preserve the brief’s subject and styling."
        : "",
    LIGHTING[direction.lighting],
    COMPOSITION[direction.composition],
    direction.detail === "crisp"
      ? "Fine detail at the focal plane, clear material separation, and restrained sharpening consistent with the chosen medium."
      : "Texture and focus consistent with the intended medium.",
    (input.inputReferences?.length ?? 0) > 0 ? REFERENCE[direction.referenceRole] : "",
  ].filter(Boolean);

  // Descriptive families favor the subject first and positive visual language.
  // Do not inject negative prompts, guidance scales, sampling steps or resolution claims.
  if (imagePromptFamily(input.model) === "descriptive") {
    return `${input.prompt.trim()}\n\n${cues.join(" ")}`;
  }
  return `${input.prompt.trim()}\n\nCreative direction (the explicit brief takes precedence):\n${cues.join(" ")}\nPreserve explicitly requested wording, counts, colors, and subject details.`;
}
