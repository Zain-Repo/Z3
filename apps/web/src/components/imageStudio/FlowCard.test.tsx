import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { UtilityFlowCard } from "./UtilityFlowCard";
import { FlowCard, initialImageInput, type ImageCatalog } from "./FlowCard";
import { newFlowNode, type FlowNode } from "./flowModel";

vi.mock("../ImageGenerationGallery", () => ({
  LazyGeneratedImageTile: () => <div>Image preview</div>,
}));
vi.mock("./CivitaiAdvancedSettings", () => ({ CivitaiAdvancedSettings: () => null }));
vi.mock("../../environments/primary/videoAssetLoader", () => ({ loadPrimaryVideoAsset: vi.fn() }));

const entry: ImageCatalog = {
  provider: "openrouter",
  model: {
    id: "test/image",
    name: "Test image model",
    supportedParameters: {
      n: { type: "range", min: 1, max: 4 },
      aspect_ratio: { type: "enum", values: ["1:1", "16:9"] },
    },
    inputModalities: ["text"],
    outputModalities: ["image"],
    supportsStreaming: false,
  },
};
const render = (node: FlowNode, Card = FlowCard) =>
  renderToStaticMarkup(
    <Card
      node={node}
      selected={false}
      disabled={false}
      catalogs={[entry]}
      videoModels={[]}
      images={[]}
      videos={[]}
      status={undefined}
      connected=""
      pendingConnection={false}
      loadImage={async () => ({ mediaType: "image/png", data: "" })}
      onChange={() => undefined}
      onDrag={() => undefined}
      onSelect={() => undefined}
      onPort={() => undefined}
      onRun={() => undefined}
      onDuplicate={() => undefined}
      onRemove={() => undefined}
    />,
  );

describe("ZImage canvas cards", () => {
  it("renders an editable prompt with an accessible output and no generation controls", () => {
    const html = render({ ...newFlowNode("text", { x: 0, y: 0 }), text: "A mountain at sunrise" });
    expect(html).toContain('aria-label="Prompt"');
    expect(html).toContain("A mountain at sunrise");
    expect(html).toContain('aria-label="Connect from Prompt"');
    expect(html).not.toContain("Generate image");
    expect(html).toContain('tabindex="0"');
  });
  it("places model settings after the image output and disables unsupported reference ports", () => {
    const html = render({
      ...newFlowNode("image", { x: 0, y: 0 }),
      image: initialImageInput(entry),
    });
    expect(html.indexOf('class="zf-output"')).toBeLessThan(
      html.indexOf('aria-label="image model"'),
    );
    expect(html).toContain('aria-label="Number of images"');
    expect(html).toContain('aria-label="Aspect ratio"');
    expect(html).toContain("reference is not supported by this model");
    expect(html).toContain("Generate image");
  });
  it("keeps library assets reusable without exposing a generate action", () => {
    const html = render({ ...newFlowNode("image", { x: 0, y: 0 }), libraryAsset: true });
    expect(html).toContain("Original preserved");
    expect(html).not.toContain("Generate image");
    expect(html).toContain('aria-label="Connect from Image"');
    expect(html).not.toContain('aria-label="Connect to Image: prompt"');
  });
});

describe("Canvas utility card controls", () => {
  it("keeps notes editable without model ports or generation buttons", () => {
    const html = render(newFlowNode("note", { x: 0, y: 0 }), UtilityFlowCard);
    expect(html).toContain('aria-label="Note"');
    expect(html).not.toContain("Connect from");
    expect(html).toContain("not sent to models");
  });
  it("exposes a combiner's input, draggable output and separator", () => {
    const html = render(newFlowNode("combine", { x: 0, y: 0 }), UtilityFlowCard);
    expect(html).toContain('aria-label="Prompt separator"');
    expect(html).toContain('aria-label="Connect to Combine: prompt"');
    expect(html).toContain('draggable="true"');
  });
  it("provides image upload controls on a reference card", () => {
    const html = render(newFlowNode("reference", { x: 0, y: 0 }), UtilityFlowCard);
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(html).toContain("Choose image");
    expect(html).not.toContain("Generate image");
  });
});
