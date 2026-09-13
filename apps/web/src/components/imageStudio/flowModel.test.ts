import { describe, expect, it } from "vite-plus/test";
import type { ImageGenerationModel, VideoGenerationModel } from "@t3tools/contracts";
import {
  connectedPrompt,
  connectionError,
  imageFlowInput,
  newFlowBoard,
  newFlowNode,
  parseFlowBoard,
  planFlow,
  screenToCanvas,
  videoFlowInput,
  zoomAt,
  type FlowBoard,
  type FlowEdge,
} from "./flowModel";
import { executeFlowPlan } from "./flowExecution";

const imageModel: ImageGenerationModel = {
  id: "test/image",
  supportedParameters: {
    n: { type: "range", min: 1, max: 4 },
    aspect_ratio: { type: "enum", values: ["1:1", "16:9"] },
    input_references: { type: "range", min: 0, max: 2 },
  },
  inputModalities: ["text", "image"],
  outputModalities: ["image"],
  supportsStreaming: false,
};
const videoModel: VideoGenerationModel = {
  id: "test/video",
  generateAudio: false,
  supportsSeed: true,
  supportedDurations: [5, 10],
  supportedResolutions: ["720p"],
  supportedAspectRatios: ["16:9"],
  supportedFrameImages: ["first_frame"],
  supportedSizes: [],
  allowedPassthroughParameters: [],
  pricingSkus: {},
};
function fixture() {
  const text = {
    ...newFlowNode("text", { x: 100, y: 100 }),
    id: "prompt",
    text: "A glass bottle on pale stone.",
  };
  const image = {
    ...newFlowNode("image", { x: 500, y: 100 }),
    id: "image",
    image: { model: imageModel.id, prompt: "Canvas prompt", n: 2, aspectRatio: "16:9" },
  };
  const compare = { ...image, id: "compare" };
  const video = {
    ...newFlowNode("video", { x: 900, y: 100 }),
    id: "video",
    video: { model: videoModel.id, prompt: "Canvas prompt", duration: 5 },
  };
  const edges: FlowEdge[] = [
    { id: "a", source: text.id, target: image.id, port: "prompt" },
    { id: "b", source: text.id, target: compare.id, port: "prompt" },
    { id: "c", source: text.id, target: video.id, port: "prompt" },
    { id: "d", source: image.id, target: video.id, port: "first_frame" },
  ];
  const board: FlowBoard = { ...newFlowBoard(), nodes: [text, image, compare, video], edges };
  return { text, image, compare, video, board };
}

describe("ZImage workflow connections and persistence", () => {
  it("round-trips positions, configurations, connections and output selection", () => {
    const { board } = fixture();
    expect(parseFlowBoard(JSON.parse(JSON.stringify(board)) as unknown)).toEqual(board);
  });
  it("rejects malformed imports, duplicates, dangling edges and cycles", () => {
    const { board, image, compare } = fixture();
    expect(() => parseFlowBoard({ ...board, version: 2 })).toThrow();
    expect(() => parseFlowBoard({ ...board, nodes: [...board.nodes, image] })).toThrow("Duplicate");
    expect(() => parseFlowBoard({ ...board, viewport: { x: 0, y: 0, zoom: 0 } })).toThrow("zoom");
    expect(() =>
      parseFlowBoard({
        ...board,
        edges: [
          ...board.edges,
          { id: "missing", source: "missing", target: image.id, port: "reference" },
        ],
      }),
    ).toThrow("exist");
    const edges: FlowEdge[] = [
      ...board.edges,
      { id: "e", source: image.id, target: compare.id, port: "reference" },
    ];
    expect(
      connectionError(board.nodes, edges, {
        source: compare.id,
        target: image.id,
        port: "reference",
      }),
    ).toContain("loop");
  });
  it("rejects incompatible media, duplicate ports and self connections", () => {
    const { board, text, image, video } = fixture();
    expect(
      connectionError(board.nodes, board.edges, {
        source: text.id,
        target: image.id,
        port: "reference",
      }),
    ).toContain("text");
    expect(
      connectionError(board.nodes, board.edges, {
        source: image.id,
        target: image.id,
        port: "reference",
      }),
    ).toContain("itself");
    expect(
      connectionError(board.nodes, board.edges, {
        source: image.id,
        target: video.id,
        port: "reference",
      }),
    ).toContain("frame");
    expect(
      connectionError(board.nodes, board.edges, {
        source: "compare",
        target: video.id,
        port: "first_frame",
      }),
    ).toContain("one image");
    expect(
      connectionError(board.nodes, board.edges, {
        source: video.id,
        target: image.id,
        port: "reference",
      }),
    ).toContain("image");
  });
  it("preserves one shared prompt across different models and adds local instructions last", () => {
    const { board, image, compare, text } = fixture();
    expect(imageFlowInput(board, image, imageModel, []).prompt).toBe(
      imageFlowInput(board, compare, imageModel, []).prompt,
    );
    expect(connectedPrompt(board, { ...image, text: "Keep the label readable." })).toBe(
      `${text.text}\n\nKeep the label readable.`,
    );
  });
  it("rejects empty prompts and unsupported settings before paid requests", () => {
    const { board, image } = fixture();
    expect(() => imageFlowInput({ ...board, edges: [] }, image, imageModel, [])).toThrow("prompt");
    expect(() =>
      imageFlowInput(board, { ...image, image: { ...image.image, n: 10 } }, imageModel, []),
    ).toThrow("not supported");
    expect(() =>
      imageFlowInput(
        board,
        { ...image, image: { ...image.image, aspectRatio: "4:3" } },
        imageModel,
        [],
      ),
    ).toThrow("not supported");
    expect(() =>
      imageFlowInput(board, image, { ...imageModel, supportedParameters: {} }, [
        { port: "reference", url: "data:image/png;base64,abc" },
      ]),
    ).toThrow();
  });
  it("forwards image references and validates first/last-frame capability", () => {
    const { board, image, video } = fixture();
    const url = "data:image/png;base64,abc";
    expect(
      imageFlowInput(board, image, imageModel, [{ port: "reference", url }]).inputReferences,
    ).toEqual([{ url }]);
    expect(
      videoFlowInput(board, video, videoModel, [{ port: "first_frame", url }]).frameImages,
    ).toEqual([{ url, frameType: "first_frame" }]);
    expect(() => videoFlowInput(board, video, videoModel, [{ port: "last_frame", url }])).toThrow(
      "does not support",
    );
  });
  it("plans comparisons before dependent videos and reuses existing upstream outputs", () => {
    const { board } = fixture();
    expect(
      planFlow(board, ["image", "compare", "video"], () => false).map((wave) =>
        wave.map((node) => node.id),
      ),
    ).toEqual([["image", "compare"], ["video"]]);
    expect(
      planFlow(board, ["video"], () => false).map((wave) => wave.map((node) => node.id)),
    ).toEqual([["image"], ["video"]]);
    expect(
      planFlow(board, ["video"], () => true).map((wave) => wave.map((node) => node.id)),
    ).toEqual([["video"]]);
  });
  it("does not regenerate library assets", () => {
    const { board, image } = fixture();
    const withLibrary = {
      ...board,
      nodes: board.nodes.map((node) =>
        node.id === image.id ? { ...node, libraryAsset: true } : node,
      ),
    };
    expect(
      planFlow(withLibrary, [image.id, "video"], () => true)
        .flat()
        .map((node) => node.id),
    ).toEqual(["video"]);
  });
  it("keeps the cursor's world position fixed when zooming and clamps zoom", () => {
    const viewport = { x: 120, y: -70, zoom: 0.75 };
    const point = { x: 432, y: 231 };
    expect(screenToCanvas(point, zoomAt(viewport, 1.5, point))).toEqual(
      screenToCanvas(point, viewport),
    );
    expect(zoomAt(viewport, 10, point).zoom).toBe(1.75);
    expect(zoomAt(viewport, 0, point).zoom).toBe(0.25);
  });
});

describe("ZImage workflow execution", () => {
  it("continues independent comparisons and skips descendants of failed images", async () => {
    const { board } = fixture();
    const executed: string[] = [];
    const errors: string[] = [];
    const skipped: string[] = [];
    await executeFlowPlan(
      planFlow(board, ["image", "compare", "video"], () => false),
      board.edges,
      {
        shouldStop: () => false,
        execute: async (node) => {
          executed.push(node.id);
          if (node.id === "image") throw new Error("Provider unavailable");
        },
        onError: (node) => errors.push(node.id),
        onSkipped: (node) => skipped.push(node.id),
      },
    );
    expect(executed).toEqual(["image", "compare"]);
    expect(errors).toEqual(["image"]);
    expect(skipped).toEqual(["video"]);
  });
  it("never runs more than two cards at once and stops scheduling after current requests", async () => {
    const { image } = fixture();
    const nodes = Array.from({ length: 5 }, (_, index) => ({ ...image, id: String(index) }));
    let active = 0;
    let maximum = 0;
    let stopped = false;
    const releases: (() => void)[] = [];
    const executed: string[] = [];
    const completion = executeFlowPlan([nodes], [], {
      shouldStop: () => stopped,
      execute: async (node) => {
        executed.push(node.id);
        active++;
        maximum = Math.max(active, maximum);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
      },
      onError: () => {
        throw new Error("Unexpected failure");
      },
      onSkipped: () => {
        throw new Error("Unexpected skip");
      },
    });
    expect(executed).toEqual(["0", "1"]);
    stopped = true;
    releases.forEach((release) => release());
    await completion;
    expect(maximum).toBe(2);
    expect(executed).toEqual(["0", "1"]);
    expect(active).toBe(0);
  });
});
