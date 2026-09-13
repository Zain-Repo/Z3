import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_IMAGE_DIRECTION, prepareImagePrompt } from "./imageCreativeDirection.ts";

describe("image creative direction", () => {
  it("preserves legacy prompts verbatim with direction disabled", () => {
    expect(prepareImagePrompt({ model: "model", prompt: "  Original\ntext  " })).toBe(
      "  Original\ntext  ",
    );
  });

  it("keeps the subject first and uses positive visual descriptions for FLUX and Z-Image", () => {
    for (const model of [
      "black-forest-labs/flux.2-pro",
      "civitai/z-image-turbo",
      "civitai/comfy-zImage-base",
    ]) {
      const prompt = prepareImagePrompt({
        model,
        prompt: "A ceramic cup",
        creativeDirection: {
          ...DEFAULT_IMAGE_DIRECTION,
          style: "photographic",
          lighting: "studio",
          detail: "crisp",
        },
      });
      expect(prompt.startsWith("A ceramic cup\n\n")).toBe(true);
      expect(prompt).toContain("lifelike surface texture");
      expect(prompt).toContain("diffused studio key light");
      expect(prompt).not.toMatch(/negative|8K|guidance_scale|Creative direction/);
    }
  });

  it("keeps explicit brief details authoritative for instruction models", () => {
    const prompt = prepareImagePrompt({
      model: "google/gemini-image",
      prompt: 'Two red signs reading "Hello"',
      creativeDirection: DEFAULT_IMAGE_DIRECTION,
    });
    expect(prompt).toContain('Two red signs reading "Hello"');
    expect(prompt).toContain("explicit brief takes precedence");
    expect(prompt).toContain("wording, counts, colors");
  });

  it("adds reference intent only when references are actually attached", () => {
    const input = {
      model: "model",
      prompt: "A cup",
      creativeDirection: { ...DEFAULT_IMAGE_DIRECTION, referenceRole: "style" as const },
    };
    expect(prepareImagePrompt(input)).not.toContain("attached references");
    expect(
      prepareImagePrompt({ ...input, inputReferences: [{ url: "data:image/png;base64,AA==" }] }),
    ).toContain("palette, texture");
  });

  it("does not mutate or accumulate instructions on a reused request", () => {
    const input = {
      model: "model",
      prompt: "A cup",
      creativeDirection: DEFAULT_IMAGE_DIRECTION,
      seed: 123,
      quality: "low" as const,
    };
    expect(prepareImagePrompt(input)).toBe(prepareImagePrompt(structuredClone(input)));
    expect(input.prompt).toBe("A cup");
    expect(input.quality).toBe("low");
    expect(input.seed).toBe(123);
  });
});

it("adds realism only when requested and keeps native negatives separate", () => {
  const input = {
    model: "civitai/flux",
    prompt: "A linen jacket",
    creativeDirection: DEFAULT_IMAGE_DIRECTION,
    civitai: { negativePrompt: "compression artifacts" },
  };
  const legacy = prepareImagePrompt(input);
  expect(
    prepareImagePrompt({
      ...input,
      creativeDirection: { ...DEFAULT_IMAGE_DIRECTION, realism: "off" },
    }),
  ).toBe(legacy);
  const natural = prepareImagePrompt({
    ...input,
    creativeDirection: { ...DEFAULT_IMAGE_DIRECTION, realism: "natural" },
  });
  expect(natural).toContain("plausible lens perspective");
  expect(natural).not.toContain("compression artifacts");
  expect(natural.startsWith("A linen jacket")).toBe(true);
  expect(
    prepareImagePrompt({
      ...input,
      creativeDirection: { ...DEFAULT_IMAGE_DIRECTION, realism: "editorial" },
    }),
  ).toContain("restrained retouching");
});
