import type { ImageGenerationRecord } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { blankFlowBoard, newFlowNode, type FlowBoard } from "./flowModel";
import { flowLibraryPreview } from "./flowLibraryPreview";

const source = {
  ...newFlowNode("image", { x: 0, y: 0 }),
  id: "source",
  generationIds: ["generation"],
};
const library = { ...newFlowNode("library", { x: 0, y: 0 }), id: "library" };
const board: FlowBoard = {
  ...blankFlowBoard(),
  nodes: [source, library],
  edges: [{ id: "edge", source: source.id, target: library.id, port: "reference" }],
};
const record: ImageGenerationRecord = {
  id: "generation",
  model: "test",
  prompt: "Portrait",
  createdAt: "2026-09-14T00:00:00Z",
  assets: ["first", "second"].map((id) => ({
    id,
    mediaType: "image/png",
    sizeBytes: 100,
    createdAt: "2026-09-14T00:00:00Z",
    url: `/api/images/assets/${id}`,
  })),
};

it("shows the connected output immediately and tracks source selection", () => {
  expect(flowLibraryPreview(board, library, [record]).images[0]?.assetId).toBe("first");
  const changed = { ...board, nodes: [{ ...source, assetIndex: 1 }, library] };
  expect(flowLibraryPreview(changed, library, [record]).images[0]?.assetId).toBe("second");
  expect(library.libraryImages).toBeUndefined();
});

it("tracks newly generated outputs and removes disconnected previews", () => {
  expect(flowLibraryPreview(board, library, []).images).toEqual([{ name: "Image" }]);
  expect(flowLibraryPreview(board, library, [record]).images).toHaveLength(1);
  expect(flowLibraryPreview({ ...board, edges: [] }, library, [record]).images).toEqual([]);
});

it("shows embedded references and nested library inputs in execution order", () => {
  const reference = {
    ...newFlowNode("reference", { x: 0, y: 0 }),
    id: "reference",
    reference: { name: "Upload", url: "data:image/png;base64,AAAA" },
  };
  const nested = {
    ...newFlowNode("library", { x: 0, y: 0 }),
    id: "nested",
    libraryImages: [{ name: "Saved", assetId: "saved" }],
  };
  const connected: FlowBoard = {
    ...board,
    nodes: [...board.nodes, reference, nested],
    edges: [
      { id: "a", source: reference.id, target: nested.id, port: "reference" },
      { id: "b", source: nested.id, target: library.id, port: "reference" },
      ...board.edges,
    ],
  };
  const preview = flowLibraryPreview(connected, library, [record]);
  expect(preview.images.map((image) => image.assetId ?? image.url)).toEqual([
    "saved",
    reference.reference.url,
    "first",
  ]);
});
