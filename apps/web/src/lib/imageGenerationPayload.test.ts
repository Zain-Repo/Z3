import { assert, describe, it } from "@effect/vitest";

import {
  parseImageGenerationPayload,
  serializeImageGenerationPayload,
} from "./imageGenerationPayload";

describe("image generation payloads", () => {
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
