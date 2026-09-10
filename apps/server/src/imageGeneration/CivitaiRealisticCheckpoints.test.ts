import { describe, expect, it } from "@effect/vitest";
import { CIVITAI_MODELS, civitaiCapabilities } from "./CivitaiModels.ts";
import { CIVITAI_REALISTIC_CHECKPOINTS } from "./CivitaiRealisticCheckpoints.ts";

describe("realistic checkpoint recommendations", () => {
  it("offers each verified version only on compatible checkpoint routes", () => {
    const exposed = new Set<string>();
    for (const model of CIVITAI_MODELS) {
      const capabilities = civitaiCapabilities(model);
      for (const checkpoint of capabilities?.recommendedCheckpoints ?? []) {
        expect(capabilities?.checkpoint).not.toBe("unsupported");
        expect(capabilities?.ecosystems).toContain(checkpoint.baseModel);
        expect(checkpoint.air).toMatch(/^urn:air:[^:]+:checkpoint:civitai:\d+@\d+$/);
        exposed.add(checkpoint.air);
      }
    }
    expect(exposed.size).toBe(CIVITAI_REALISTIC_CHECKPOINTS.length);
  });

  it("keeps the ready-to-use default and excludes API-only models", () => {
    expect(CIVITAI_MODELS[0]?.id).toBe("civitai/z-image-turbo");
    for (const model of CIVITAI_MODELS.filter((entry) =>
      ["google", "openai", "grok"].includes(entry.routing.engine ?? ""),
    )) {
      expect(civitaiCapabilities(model)).toBeUndefined();
    }
  });
});
