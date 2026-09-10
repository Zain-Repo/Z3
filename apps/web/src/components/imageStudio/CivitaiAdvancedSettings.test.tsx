import type { ImageGenerationInput, ImageGenerationModel } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { CivitaiAdvancedSettings } from "./CivitaiAdvancedSettings";

// Rendering the form must not initialize network runtimes or issue a search.
vi.mock("../../lib/runtime", () => ({ runPrimaryHttp: vi.fn() }));

const model: ImageGenerationModel = {
  id: "civitai/community-sdxl",
  inputModalities: ["text"],
  outputModalities: ["image"],
  supportedParameters: {},
  supportsStreaming: false,
};
const capabilities: NonNullable<ImageGenerationModel["civitai"]> = {
  checkpoint: "required",
  ecosystems: ["sdxl"],
  maxLoras: 4,
  strength: { min: -1, max: 2 },
  negativePrompt: true,
  steps: { min: 1, max: 50 },
  cfgScale: { min: 1, max: 20 },
};

function render(
  selectedModel: ImageGenerationModel,
  value: NonNullable<ImageGenerationInput["civitai"]> = {},
) {
  return renderToStaticMarkup(
    <CivitaiAdvancedSettings
      model={selectedModel}
      value={value}
      onChange={() => {}}
      disabled={false}
    />,
  );
}

describe("CivitaiAdvancedSettings", () => {
  it("offers realistic checkpoint versions and identifies reused selections", () => {
    const checkpoint = {
      air: "urn:air:sdxl:checkpoint:civitai:133005@1759168",
      name: "Juggernaut XL",
      versionName: "Ragnarok",
      baseModel: "SDXL 1.0",
      trainedWords: [],
    };
    const markup = render(
      { ...model, civitai: { ...capabilities, recommendedCheckpoints: [checkpoint] } },
      { checkpoint: checkpoint.air },
    );
    expect(markup).toContain("Realistic checkpoints");
    expect(markup).toContain("Juggernaut XL");
    expect(markup).toContain("Ragnarok (SDXL 1.0)");
    expect(markup).toContain(`value="${checkpoint.air}" selected=""`);
    expect(markup).toContain("Search checkpoints");
  });
  it("explains when the Civitai route does not support LoRAs", () => {
    const markup = render(model);
    expect(markup).toContain("Custom LoRAs are not available for this Civitai route in ZImage.");
    expect(markup).not.toContain("Search LoRAs");
  });

  it("marks required checkpoints and displays supported generation controls", () => {
    const markup = render({ ...model, civitai: capabilities });
    expect(markup).toContain("Checkpoint (required)");
    expect(markup).toContain("Compatible base models: sdxl");
    expect(markup).toContain('placeholder="Name, keyword, or Civitai model link"');
    expect(markup).toContain("Choose a compatible checkpoint before generating.");
    expect(markup).toContain("Negative prompt");
    expect(markup).toContain("Sampling steps");
    expect(markup).toContain("Guidance (CFG)");
    expect(markup).toContain('placeholder="Provider default"');
    expect(markup).toContain('min="1" max="50" step="1"');
    expect(markup).toContain('min="1" max="20" step="0.1"');
  });

  it("omits resource and numeric controls that the model does not support", () => {
    const markup = render({
      ...model,
      civitai: {
        checkpoint: "unsupported",
        ecosystems: ["zimage"],
        maxLoras: 0,
        strength: { min: 0, max: 1 },
        negativePrompt: false,
      },
    });
    expect(markup).not.toContain("Search checkpoints");
    expect(markup).not.toContain("Search LoRAs");
    expect(markup).not.toContain("Negative prompt");
    expect(markup).not.toContain("Sampling steps");
    expect(markup).not.toContain("Guidance (CFG)");
  });

  it("keeps imported resources identifiable with removal and bounded strength controls", () => {
    const air = "urn:air:sdxl:lora:civitai:123@456";
    const checkpoint = "urn:air:sdxl:checkpoint:civitai:789@1011";
    const markup = render(
      { ...model, civitai: capabilities },
      {
        checkpoint,
        loras: [{ air, strength: 0.7 }],
      },
    );
    expect(markup).toContain(checkpoint);
    expect(markup).toContain("Clear checkpoint");
    expect(markup).toContain(`aria-label="Remove ${air}"`);
    expect(markup).toContain(`aria-label="Strength for ${air}"`);
    expect(markup).toContain('min="-1" max="2" step="0.05"');
    expect(markup).toContain('value="0.7"');
    expect(markup).not.toContain("Choose a compatible checkpoint before generating.");
  });

  it("uses the selected route's LoRA strength range without offering unsupported checkpoints", () => {
    const markup = render(
      {
        ...model,
        civitai: {
          ...capabilities,
          checkpoint: "unsupported",
          ecosystems: ["Flux.2 D"],
          strength: { min: 0, max: 4 },
          negativePrompt: false,
        },
      },
      { loras: [{ air: "urn:air:flux2:lora:civitai:123@456", strength: 3 }] },
    );
    expect(markup).toContain('min="0" max="4" step="0.05"');
    expect(markup).toContain('value="3"');
    expect(markup).toContain("Compatible base models: Flux.2 D");
    expect(markup).not.toContain("Search checkpoints");
    expect(markup).not.toContain("Negative prompt");
  });
});
