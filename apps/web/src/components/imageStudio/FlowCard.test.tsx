import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { UtilityFlowCard } from "./UtilityFlowCard";
import { FlowCard, initialImageInput, type ImageCatalog, type FlowStatus } from "./FlowCard";
import { newFlowNode, type FlowNode } from "./flowModel";
import type { FlowLibraryPreview } from "./flowLibraryPreview";

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
const render = (
  node: FlowNode,
  Card = FlowCard,
  libraryPreview?: FlowLibraryPreview,
  status?: FlowStatus,
) =>
  renderToStaticMarkup(
    <Card
      node={node}
      selected={false}
      disabled={false}
      catalogs={[entry]}
      videoModels={[]}
      images={[]}
      videos={[]}
      status={status}
      connected=""
      {...(libraryPreview ? { libraryPreview } : {})}
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
  it("preserves the fal provider when selecting an image model", () => {
    const input = initialImageInput({
      ...entry,
      provider: "fal",
      model: { ...entry.model, id: "fal/flux-2" },
    });
    expect(input.providerInstanceId).toBe("fal");
    expect(input.model).toBe("fal/flux-2");
  });
  it.each(["queued", "running"] as const)("shows a loading preview for %s generation", (state) => {
    const html = render(newFlowNode("image", { x: 0, y: 0 }), FlowCard, undefined, {
      state,
      message: state,
    });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("image-generation-skeleton");
    expect(html).toContain(state === "queued" ? "Queued for generation" : "Generating output");
    expect(html).not.toContain("Connect a prompt, then generate.");
  });
  it("shows connected images instead of the empty upload prompt", () => {
    const html = render(newFlowNode("library", { x: 0, y: 0 }), UtilityFlowCard, {
      images: [{ name: "Connected portrait", assetId: "portrait" }],
    });
    expect(html).toContain("Image preview");
    expect(html).toContain("Connected portrait");
    expect(html).toContain("1 images · 1 connected");
    expect(html).not.toContain('class="zf-library-node-dropzone"');
    expect(html).toContain("Connected · updates automatically");
  });
  it("renders the AI updater with editable inputs and a prompt output", () => {
    const html = render(newFlowNode("updater", { x: 0, y: 0 }), UtilityFlowCard);
    expect(html).toContain("Rewrite with AI");
    expect(html).toContain('aria-label="Rewrite direction"');
    expect(html).toContain('data-label="prompt output"');
  });
  it("renders a multi-image library with upload, saved images, and frame selection", () => {
    const html = render(newFlowNode("library", { x: 0, y: 0 }), UtilityFlowCard);
    expect(html).toContain("Add images");
    expect(html).toContain('aria-label="Add saved image"');
    expect(html).toContain('aria-label="Video frame image number"');
    expect(html).toContain('data-label="images"');
    expect(html).toContain('class="zf-card zf-library-node ');
    expect(html).not.toContain('class="zf-card zf-library ');
    expect(html).toContain('aria-label="Connect to Image library: reference"');
    expect(html).toContain('aria-label="Connect from Image library"');
    expect(html).toContain("Images in");
    expect(html).toContain("Images out");
  });
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
