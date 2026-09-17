import { describe, expect, it } from "vite-plus/test";
import {
  blankFlowBoard,
  connectedPrompt,
  connectionError,
  flowExecutionEdges,
  flowMediaSources,
  imageFlowInput,
  newFlowNode,
  parseFlowBoard,
  planFlow,
  type FlowBoard,
  type FlowNode,
} from "./flowModel";
import { executeFlowPlan } from "./flowExecution";

const node = (kind: FlowNode["kind"], id: string) => ({ ...newFlowNode(kind, { x: 0, y: 0 }), id });
function collection(): FlowBoard {
  return {
    ...blankFlowBoard(),
    nodes: [
      node("image", "source"),
      { ...node("library", "library"), libraryImages: [{ name: "Saved", assetId: "saved" }] },
      node("image", "target"),
      node("video", "video"),
    ],
    edges: [
      { id: "a", source: "source", target: "library", port: "reference" },
      { id: "b", source: "library", target: "target", port: "reference" },
      { id: "c", source: "library", target: "video", port: "first_frame" },
    ],
  };
}
describe("Image library canvas data flow", () => {
  it("persists library images and expands them in order while selecting one video frame", () => {
    const board = parseFlowBoard(collection());
    expect(flowMediaSources(board, board.nodes[2]!)).toEqual([
      { source: "library", name: "Saved", assetId: "saved", port: "reference" },
      { source: "source", port: "reference" },
    ]);
    expect(flowMediaSources(board, board.nodes[3]!)).toHaveLength(1);
    const selected = {
      ...board,
      nodes: board.nodes.map((item) => (item.id === "library" ? { ...item, assetIndex: 1 } : item)),
    };
    expect(flowMediaSources(selected, selected.nodes[3]!)).toEqual([
      { source: "source", port: "first_frame" },
    ]);
  });
  it("schedules missing generation dependencies through a library and reuses completed outputs", () => {
    const board = collection();
    expect(
      planFlow(board, ["target"], () => false).map((wave) => wave.map((item) => item.id)),
    ).toEqual([["source"], ["target"]]);
    expect(
      planFlow(board, ["target"], () => true)
        .flat()
        .map((item) => item.id),
    ).toEqual(["target"]);
  });
  it("skips a consumer when its image generation fails through a library", async () => {
    const board = collection();
    const waves = planFlow(board, ["target"], () => false);
    const skipped: string[] = [];
    await executeFlowPlan(waves, flowExecutionEdges(board, waves.flat()), {
      shouldStop: () => false,
      execute: async () => {
        throw new Error("Provider failed");
      },
      onError: () => {},
      onSkipped: (item) => {
        skipped.push(item.id);
      },
    });
    expect(skipped).toEqual(["target"]);
  });
  it("rejects empty collections, invalid frame selection, loops, and invalid embedded images", () => {
    const board = collection();
    expect(() =>
      flowMediaSources(
        {
          ...board,
          edges: board.edges.filter((edge) => edge.id !== "a"),
          nodes: board.nodes.map((item) =>
            item.id === "library" ? { ...item, libraryImages: [] } : item,
          ),
        },
        board.nodes[2]!,
      ),
    ).toThrow("add or connect images");
    expect(() =>
      flowMediaSources(
        {
          ...board,
          nodes: board.nodes.map((item) =>
            item.id === "library" ? { ...item, assetIndex: 9 } : item,
          ),
        },
        board.nodes[3]!,
      ),
    ).toThrow("select an available frame");
    expect(
      connectionError(board.nodes, board.edges, {
        source: "target",
        target: "library",
        port: "reference",
      }),
    ).toContain("loop");
    expect(() =>
      parseFlowBoard({
        ...board,
        nodes: [
          {
            ...node("library", "invalid"),
            libraryImages: [{ name: "Unsafe", url: "https://example.com/image.png" }],
          },
        ],
        edges: [],
      }),
    ).toThrow("embedded image");
  });
  it("rejects collections beyond the reference bound", () => {
    const board = collection();
    const large = {
      ...board,
      nodes: board.nodes.map((item) =>
        item.id === "library"
          ? {
              ...item,
              libraryImages: Array.from({ length: 16 }, (_, index) => ({
                name: `${index}`,
                assetId: `${index}`,
              })),
            }
          : item,
      ),
    };
    expect(() => flowMediaSources(large, large.nodes[2]!)).toThrow("at most 16");
  });
});

describe("AI prompt updater output", () => {
  it("passes the edited rewrite downstream and invalidates it when upstream text changes", () => {
    const prompt = { ...node("text", "prompt"), text: "A cup" };
    const updater = {
      ...node("updater", "updater"),
      instructions: "Photograph",
      rewrite: {
        source: "A cup",
        instructions: "Photograph",
        result: "A ceramic cup in warm window light.",
      },
    };
    const target = { ...node("image", "target"), image: { model: "test", prompt: "unused" } };
    const board: FlowBoard = {
      ...blankFlowBoard(),
      nodes: [prompt, updater, target],
      edges: [
        { id: "a", source: "prompt", target: "updater", port: "prompt" },
        { id: "b", source: "updater", target: "target", port: "prompt" },
      ],
    };
    expect(connectedPrompt(parseFlowBoard(board), target)).toBe(updater.rewrite.result);
    expect(connectedPrompt(board, updater, true)).toBe("A cup");
    const stale = { ...board, nodes: [{ ...prompt, text: "A vase" }, updater, target] };
    expect(connectedPrompt(stale, target)).toBe("");
    expect(() =>
      imageFlowInput(
        stale,
        target,
        {
          id: "test",
          name: "Test",
          supportedParameters: {},
          inputModalities: ["text"],
          outputModalities: ["image"],
          supportsStreaming: false,
        },
        [],
      ),
    ).toThrow("rewrite the prompt");
  });
});
