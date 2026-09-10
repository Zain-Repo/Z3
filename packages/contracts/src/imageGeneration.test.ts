import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { ImageGenerationInput } from "./imageGeneration.ts";

const decodeInput = Schema.decodeUnknownSync(ImageGenerationInput);

describe("image generation requests", () => {
  it("accepts the complete GPT Image 2.5 quality range", () => {
    for (const model of ["openai/gpt-image-2.5-sunburst", "openai/gpt-image-2.5-flare"]) {
      for (const quality of ["auto", "low", "medium", "high", "xhigh", "max"]) {
        const input = { model, prompt: "A quiet studio", quality };
        expect(decodeInput(input)).toEqual(input);
      }
    }
  });

  it("rejects unknown quality settings", () => {
    expect(() =>
      decodeInput({
        model: "openai/gpt-image-2.5-flare",
        prompt: "A quiet studio",
        quality: "invalid",
      }),
    ).toThrow();
  });
});
