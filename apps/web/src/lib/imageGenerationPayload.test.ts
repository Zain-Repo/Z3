import { assert, describe, it } from "@effect/vitest";

import {
  parseImageGenerationPayload,
  serializeImageGenerationPayload,
} from "./imageGenerationPayload";

describe("image generation payloads", () => {
  it("preserves Civitai resources and advanced settings when reusing a generation", () => {
    const input = {
      model: "civitai/z-image-base",
      prompt: "A quiet studio",
      civitai: {
        checkpoint: "urn:air:zimage:checkpoint:civitai:123@456",
        loras: [{ air: "urn:air:zimage:lora:civitai:789@1234", strength: 0.7 }],
        negativePrompt: "blurry",
        steps: 20,
        cfgScale: 4,
      },
    };
    assert.deepEqual(parseImageGenerationPayload(serializeImageGenerationPayload(input)), {
      input,
    });
    assert.deepEqual(parseImageGenerationPayload(JSON.stringify({ input })), { input });
  });

  it("rejects malformed Civitai options instead of silently dropping them", () => {
    for (const civitai of [
      null,
      { loras: "bad" },
      { loras: [{ air: "id", strength: "high" }] },
      { steps: "many" },
    ]) {
      const result = parseImageGenerationPayload(
        JSON.stringify({ model: "civitai/z-image-base", prompt: "A cat", civitai }),
      );
      assert.ok("error" in result);
    }
  });
  it("round-trips GPT Image 2.5 quality settings", () => {
    for (const model of ["openai/gpt-image-2.5-sunburst", "openai/gpt-image-2.5-flare"]) {
      for (const quality of ["xhigh", "max"] as const) {
        const input = { model, prompt: "A quiet studio", quality };
        assert.deepEqual(parseImageGenerationPayload(serializeImageGenerationPayload(input)), {
          input,
        });
      }
    }
  });

  it("round-trips the reusable editor fields", () => {
    const payload = {
      model: "openai/image-model",
      prompt: "A quiet studio portrait with afternoon light",
      n: 2,
      aspectRatio: "4:3",
      quality: "high",
      outputFormat: "webp",
      outputCompression: 80,
      seed: 42,
      provider: { only: ["provider-a"] },
    } as const;

    const result = parseImageGenerationPayload(serializeImageGenerationPayload(payload));

    assert.deepEqual(result, { input: payload });
  });

  it("accepts a copied generation record wrapper", () => {
    const result = parseImageGenerationPayload(
      JSON.stringify({
        id: "generation-1",
        model: "openai/image-model",
        prompt: "Fallback prompt",
        input: {
          model: "openai/image-model",
          prompt: "Reusable prompt",
        },
      }),
    );

    assert.deepEqual(result, {
      input: { model: "openai/image-model", prompt: "Reusable prompt" },
    });
  });

  it("reports malformed JSON and invalid fields without throwing", () => {
    assert.deepEqual(parseImageGenerationPayload("{"), {
      error: "Paste valid JSON before applying it.",
    });
    assert.deepEqual(parseImageGenerationPayload('{"model":"model"}'), {
      error: "prompt must be a non-empty string.",
    });
    assert.deepEqual(parseImageGenerationPayload('{"model":"model","prompt":"prompt","n":11}'), {
      error: "n must be an integer between 1 and 10.",
    });
  });
});
