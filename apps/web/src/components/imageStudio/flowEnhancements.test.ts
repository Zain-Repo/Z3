import { describe, expect, it } from "vite-plus/test";
import {
  arrangeFlow,
  connectedPrompt,
  connectionError,
  newFlowBoard,
  newFlowNode,
  parseFlowBoard,
  planFlow,
  reorderPromptInput,
  workflowStarter,
  type FlowBoard,
} from "./flowModel";
import { referenceFileError, readFlowReference } from "./flowReference";
import { decodeStoredFlow, nextFlowRevision } from "./flowStorage";

function promptBoard(): FlowBoard {
  const subject = { ...newFlowNode("text", { x: 0, y: 0 }), id: "subject", text: "Ceramic vase" };
  const light = { ...newFlowNode("text", { x: 0, y: 0 }), id: "light", text: "Window light" };
  const combine = {
    ...newFlowNode("combine", { x: 0, y: 0 }),
    id: "combine",
    text: "Editorial photograph",
    separator: "line" as const,
  };
  const image = { ...newFlowNode("image", { x: 0, y: 0 }), id: "image" };
  return {
    ...newFlowBoard(),
    nodes: [subject, light, combine, image],
    edges: [
      { id: "a", source: subject.id, target: combine.id, port: "prompt" },
      { id: "b", source: light.id, target: combine.id, port: "prompt" },
      { id: "c", source: combine.id, target: image.id, port: "prompt" },
    ],
  };
}

describe("Canvas utility components", () => {
  it("bounds expanded prompts so repeated composition cannot allocate unbounded text", () => {
    const board = promptBoard();
    const expanded = {
      ...board,
      nodes: board.nodes.map((node) =>
        node.id === "subject" ? { ...node, text: "x".repeat(200_000) } : node,
      ),
    };
    expect(connectedPrompt(expanded, expanded.nodes[3]!)).toHaveLength(100_001);
  });

  it("assembles nested prompts without executing text utilities", () => {
    const board = promptBoard();
    const image = board.nodes[3]!;
    expect(connectedPrompt(board, image)).toBe("Ceramic vase\nWindow light\nEditorial photograph");
    expect(
      planFlow(
        board,
        board.nodes.map((node) => node.id),
        () => false,
      )
        .flat()
        .map((node) => node.id),
    ).toEqual(["image"]);
  });
  it("reorders prompt inputs without changing the rest of the graph", () => {
    const board = promptBoard();
    const reordered = reorderPromptInput(board, "b", -1);
    expect(connectedPrompt(reordered, board.nodes[3]!)).toBe(
      "Window light\nCeramic vase\nEditorial photograph",
    );
    expect(reordered.edges[2]).toEqual(board.edges[2]);
    expect(reorderPromptInput(board, "a", -1)).toBe(board);
  });
  it("rejects text loops, notes as model inputs, and media sent to combiners", () => {
    const board = promptBoard();
    const note = { ...newFlowNode("note", { x: 0, y: 0 }), id: "note" };
    const second = { ...newFlowNode("combine", { x: 0, y: 0 }), id: "second" };
    const nodes = [...board.nodes, note, second];
    expect(
      connectionError(nodes, board.edges, { source: note.id, target: "image", port: "prompt" }),
    ).toBeDefined();
    expect(
      connectionError(nodes, board.edges, {
        source: "image",
        target: "combine",
        port: "reference",
      }),
    ).toBeDefined();
    expect(
      connectionError(
        nodes,
        [...board.edges, { id: "d", source: "combine", target: "second", port: "prompt" }],
        { source: "second", target: "combine", port: "prompt" },
      ),
    ).toContain("loop");
  });
  it("allows uploaded references as image and video inputs without scheduling generation for them", () => {
    const board = workflowStarter("reference", { x: 140, y: 80 });
    const document = parseFlowBoard({ ...newFlowBoard(), ...board });
    expect(
      planFlow(
        document,
        document.nodes.map((node) => node.id),
        () => false,
      )
        .flat()
        .map((node) => node.kind),
    ).toEqual(["image"]);
    const video = newFlowNode("video", { x: 0, y: 0 });
    expect(
      connectionError([...board.nodes, video], board.edges, {
        source: board.nodes[1]!.id,
        target: video.id,
        port: "first_frame",
      }),
    ).toBeUndefined();
  });
  it("arranges cards in dependency columns without overlap and respects measured heights", () => {
    const board = promptBoard();
    const arranged = arrangeFlow(board, new Map([["subject", 900]]));
    const [subject, light, combine, image] = arranged.nodes;
    expect(light!.position.y).toBeGreaterThan(subject!.position.y + 900);
    expect(combine!.position.x).toBeGreaterThan(subject!.position.x);
    expect(image!.position.x).toBeGreaterThan(combine!.position.x);
    expect(arranged.edges).toEqual(board.edges);
  });
  it("creates valid starters with unique IDs and preserves existing v1 documents", () => {
    for (const kind of ["compare", "reference", "motion"] as const) {
      const first = workflowStarter(kind, { x: 100, y: 200 });
      const second = workflowStarter(kind, { x: 100, y: 200 });
      const board = parseFlowBoard({
        ...newFlowBoard(),
        nodes: [...first.nodes, ...second.nodes],
        edges: [...first.edges, ...second.edges],
      });
      expect(board.nodes).toHaveLength(6);
    }
    expect(parseFlowBoard(JSON.parse(JSON.stringify(newFlowBoard())) as unknown).version).toBe(1);
  });
  it("retains collapsed cards, canvas preferences, and embedded references on export/import", () => {
    const reference = {
      ...newFlowNode("reference", { x: 0, y: 0 }),
      reference: { name: "reference.png", url: "data:image/png;base64,iVBORw0KGgo=" },
      collapsed: true,
    };
    const board = {
      ...newFlowBoard(),
      nodes: [reference],
      edges: [],
      settings: { snapToGrid: true, showConnections: false },
    };
    expect(parseFlowBoard(JSON.parse(JSON.stringify(board)) as unknown)).toEqual(board);
    expect(() =>
      parseFlowBoard({
        ...board,
        nodes: [{ ...reference, reference: { name: "bad", url: "javascript:alert(1)" } }],
      }),
    ).toThrow("Reference images");
  });
});

describe("Canvas reference files and document storage", () => {
  it("validates file signatures as well as MIME and size", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(referenceFileError("image/png", png)).toBeUndefined();
    expect(referenceFileError("image/jpeg", png)).toContain("valid");
    expect(referenceFileError("image/svg+xml", png)).toContain("valid");
    expect(referenceFileError("image/png", new Uint8Array(8 * 1024 * 1024 + 1))).toContain("8 MB");
    const result = await readFlowReference(new File([png], "reference.png", { type: "image/png" }));
    expect(result).toEqual({ name: "reference.png", url: "data:image/png;base64,iVBORw0KGgo=" });
  });
  it("validates saved documents and rejects stale or deleted revisions", () => {
    const board = newFlowBoard();
    expect(decodeStoredFlow({ revision: 2, board })).toEqual({ revision: 2, board });
    expect(decodeStoredFlow(undefined)).toBeNull();
    expect(() => decodeStoredFlow({ revision: "2", board })).toThrow();
    expect(nextFlowRevision(null, null)).toBe(1);
    expect(nextFlowRevision(2, 2)).toBe(3);
    expect(() => nextFlowRevision(3, 2)).toThrow("another tab");
    expect(() => nextFlowRevision(null, 2)).toThrow("another tab");
  });
});
