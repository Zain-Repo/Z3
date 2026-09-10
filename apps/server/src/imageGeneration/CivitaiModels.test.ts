import { describe, expect, it } from "@effect/vitest";
import { CIVITAI_MODELS, civitaiCapabilities, civitaiLoraFormat } from "./CivitaiModels.ts";

function model(id: string) {
  const entry = CIVITAI_MODELS.find((candidate) => candidate.id === `civitai/${id}`);
  if (!entry) throw new Error(`Missing Civitai model: ${id}`);
  return entry;
}

describe("Civitai model catalog", () => {
  it("exposes LoRAs for every verified worker family and keeps hosted routes separate", () => {
    for (const entry of CIVITAI_MODELS) {
      const supported =
        entry.routing.engine === "comfy" ||
        entry.routing.engine === "sdcpp" ||
        (entry.routing.engine === "flux2" &&
          ["dev", "klein"].includes(entry.routing.model ?? "")) ||
        (entry.routing.engine === "wan" && entry.routing.version === "v2.2");
      expect(!!civitaiCapabilities(entry), entry.id).toBe(supported);
    }
    for (const [family, baseModel] of Object.entries({
      "hidream-o1": "HiDream-O1",
      krea2: "Krea 2",
      ernie: "Ernie",
      ideogram4: "Ideogram 4.0",
      lens: "Lens",
      boogu: "Boogu",
      mageflow: "MageFlow",
    })) {
      const entries = CIVITAI_MODELS.filter((entry) => entry.routing.ecosystem === family);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries)
        expect(civitaiCapabilities(entry)?.ecosystems).toEqual([baseModel]);
    }
  });

  it("keeps Klein architectures distinct and selects route-specific strengths and formats", () => {
    for (const entry of CIVITAI_MODELS.filter(
      (entry) => entry.routing.model === "klein" || entry.routing.ecosystem === "flux2Klein",
    )) {
      const version = entry.routing.modelVersion ?? "4b";
      expect(civitaiCapabilities(entry)?.ecosystems).toEqual([
        `Flux.2 Klein ${version.startsWith("9b") ? "9B" : "4B"}${version.endsWith("-base") ? "-base" : ""}`,
      ]);
      expect(civitaiLoraFormat(entry)).toBe("dictionary");
    }
    for (const id of ["flux2-dev", "wan-v2.2"]) {
      expect(civitaiLoraFormat(model(id))).toBe("array");
      expect(civitaiCapabilities(model(id))?.strength).toEqual({ min: 0, max: 4 });
    }
  });
  it("keeps saved model identifiers and covers each supported generation engine", () => {
    for (const id of [
      "z-image-turbo",
      "z-image-base",
      "flux2-klein-4b",
      "flux2-klein-9b",
      "flux2-dev",
      "flux2-flex",
      "flux2-pro",
      "flux2-max",
    ]) {
      expect(model(id).parameterMap.size).toBe("dimensions");
    }
    expect(new Set(CIVITAI_MODELS.map((entry) => entry.routing.engine))).toEqual(
      new Set([
        "openai",
        "google",
        "gemini",
        "grok",
        "seedream",
        "wan",
        "fal",
        "qwen",
        "krea",
        "flux2",
        "flux1-kontext",
        "sdcpp",
        "comfy",
      ]),
    );
    expect(new Set(CIVITAI_MODELS.map((entry) => entry.id)).size).toBe(CIVITAI_MODELS.length);
  });

  it.each([
    ["google-nano-banana-pro", { engine: "google", model: "nano-banana-pro" }],
    ["seedream-v5.0-pro", { engine: "seedream", version: "v5.0-pro" }],
    ["wan-v2.5", { engine: "wan", provider: "fal", version: "v2.5", operation: "text-to-image" }],
    ["fal-qwen2-pro", { engine: "fal", model: "qwen2", operation: "proCreateImage" }],
    [
      "comfy-flux2Klein-9b-kv",
      { engine: "comfy", ecosystem: "flux2Klein", modelVersion: "9b-kv", operation: "createImage" },
    ],
  ] as const)("routes %s through its documented discriminator fields", (id, routing) => {
    expect(model(id).routing).toEqual(routing);
  });

  it("uses provider-specific counts, dimensions, qualities, and seed ranges", () => {
    expect(model("google-imagen4").parameterMap.n).toBe("numImages");
    expect(model("openai-dall-e-3").supportedParameters.n).toBeUndefined();
    expect(model("openai-dall-e-3").supportedParameters.quality).toEqual({
      type: "enum",
      values: ["auto"],
    });
    expect(model("openai-gpt-image-2.5-flare").supportedParameters.quality).toEqual({
      type: "enum",
      values: ["low", "medium", "high", "xhigh", "max"],
    });
    expect(model("fal-qwen2").parameterMap.size).toBe("imageSize");
    expect(model("fal-qwen2").supportedParameters.seed).toEqual({
      type: "range",
      min: 0,
      max: 2147483647,
    });
    expect(model("google-nano-banana-pro").supportedParameters.seed).toBeUndefined();
  });

  it("supplies required inputs that are not user-facing controls", () => {
    expect(model("openai-dall-e-2").defaults).toEqual({ size: "1024x1024" });
    expect(model("qwen-3.0-pro").defaults).toEqual({ width: 1024, height: 1024 });
    expect(model("krea-krea2-medium").defaults).toEqual({ imageStyleReferences: [] });
    expect(model("comfy-mageflow-4b-turbo").defaults).toEqual({
      cfgScale: 1,
      quantity: 1,
      steps: 4,
    });
  });

  it("exposes only controls the adapter translates", () => {
    for (const entry of CIVITAI_MODELS) {
      expect(Object.keys(entry.supportedParameters).sort()).toEqual(
        Object.keys(entry.parameterMap)
          .map((key) =>
            key === "outputFormat" ? "output_format" : key === "aspectRatio" ? "aspect_ratio" : key,
          )
          .sort(),
      );
      expect(entry.maxPrompt).toBeGreaterThan(0);
      expect(entry.group).not.toBe("");
      const count = entry.supportedParameters.n;
      if (count?.type === "range") expect(count.max).toBeLessThanOrEqual(10);
    }
  });
});
