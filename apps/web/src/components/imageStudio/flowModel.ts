import { randomUUID } from "../../lib/utils";
import * as Schema from "effect/Schema";
import {
  ImageGenerationInput,
  VideoGenerationInput,
  videoGenerationInputError,
  type ImageGenerationModel,
  type VideoGenerationModel,
} from "@t3tools/contracts";
import { referenceImageBounds } from "../../lib/imageModelCapabilities";

const Point = Schema.Struct({ x: Schema.Finite, y: Schema.Finite });
export const FlowNode = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals([
    "text",
    "image",
    "video",
    "combine",
    "reference",
    "note",
    "updater",
    "library",
  ]),
  title: Schema.String,
  position: Point,
  text: Schema.String,
  image: Schema.NullOr(ImageGenerationInput),
  video: Schema.NullOr(VideoGenerationInput),
  videoCount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
  generationIds: Schema.Array(Schema.String),
  assetIndex: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  libraryAsset: Schema.Boolean,
  libraryImages: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        name: Schema.String,
        url: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(12_000_000))),
        assetId: Schema.optionalKey(Schema.String),
      }),
    ).check(Schema.isMaxLength(16)),
  ),
  rewrite: Schema.optionalKey(
    Schema.Struct({ source: Schema.String, instructions: Schema.String, result: Schema.String }),
  ),
  instructions: Schema.optionalKey(Schema.String),
  reference: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        name: Schema.String,
        url: Schema.String.check(Schema.isMaxLength(12_000_000)),
      }),
    ),
  ),
  separator: Schema.optionalKey(Schema.Literals(["paragraph", "line", "space"])),
  collapsed: Schema.optionalKey(Schema.Boolean),
});
export type FlowNode = typeof FlowNode.Type;
export const FlowEdge = Schema.Struct({
  id: Schema.String,
  source: Schema.String,
  target: Schema.String,
  port: Schema.Literals(["prompt", "reference", "first_frame", "last_frame"]),
});
export type FlowEdge = typeof FlowEdge.Type;
export const FlowBoard = Schema.Struct({
  version: Schema.Literal(1),
  settings: Schema.optionalKey(
    Schema.Struct({ snapToGrid: Schema.Boolean, showConnections: Schema.Boolean }),
  ),
  title: Schema.String,
  nodes: Schema.Array(FlowNode).check(Schema.isMaxLength(100)),
  edges: Schema.Array(FlowEdge).check(Schema.isMaxLength(400)),
  viewport: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, zoom: Schema.Finite }),
});
export type FlowBoard = typeof FlowBoard.Type;
const decodeBoard = Schema.decodeUnknownSync(FlowBoard);
export const CARD_WIDTH = 316;
export const PORT_Y = { prompt: 67, reference: 99, first_frame: 99, last_frame: 131 } as const;

export function newFlowNode(kind: FlowNode["kind"], position: FlowNode["position"]): FlowNode {
  return {
    id: randomUUID(),
    kind,
    position,
    title: FLOW_COMPONENTS.find((item) => item.kind === kind)?.label ?? "Card",
    text: "",
    image: null,
    video: null,
    videoCount: 1,
    generationIds: [],
    assetIndex: 0,
    libraryAsset: false,
  };
}

export function newFlowBoard(): FlowBoard {
  const prompt = newFlowNode("text", { x: 140, y: 100 });
  const image = newFlowNode("image", { x: 580, y: 100 });
  return {
    version: 1,
    title: "Untitled canvas",
    nodes: [prompt, image],
    edges: [{ id: randomUUID(), source: prompt.id, target: image.id, port: "prompt" }],
    viewport: { x: 0, y: 0, zoom: 0.9 },
  };
}

export function blankFlowBoard(title = "Untitled canvas"): FlowBoard {
  return { version: 1, title, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 0.9 } };
}

export function connectionError(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
  edge: Omit<FlowEdge, "id">,
): string | undefined {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) return "Both cards must exist.";
  if (edges.length >= 400) return "This canvas supports up to 400 connections.";
  if (source.id === target.id) return "A card cannot connect to itself.";
  if (target.libraryAsset || ["text", "note", "reference"].includes(target.kind))
    return "This card does not accept inputs.";
  if (
    edge.port === "prompt"
      ? !["text", "combine", "updater"].includes(source.kind)
      : !["image", "reference", "library"].includes(source.kind)
  )
    return "Connect text to a prompt port, or an image to a media port.";
  if (["combine", "updater"].includes(target.kind) && edge.port !== "prompt")
    return "Prompt combiners accept text inputs only.";
  if (target.kind === "library" && edge.port !== "reference")
    return "Image libraries accept image inputs only.";
  if (edge.port === "reference" && !["image", "library"].includes(target.kind))
    return "Use a video frame port for image-to-video.";
  if ((edge.port === "first_frame" || edge.port === "last_frame") && target.kind !== "video")
    return "Frame ports belong to video cards.";
  if (
    edges.some(
      (current) =>
        current.source === edge.source &&
        current.target === edge.target &&
        current.port === edge.port,
    )
  )
    return "These ports are already connected.";
  if (
    (edge.port === "first_frame" || edge.port === "last_frame") &&
    edges.some((current) => current.target === edge.target && current.port === edge.port)
  )
    return "Each frame port accepts one image. Disconnect it first.";
  const visited = new Set<string>();
  const reachesSource = (id: string): boolean => {
    if (id === source.id) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return edges
      .filter((current) => current.source === id)
      .some((current) => reachesSource(current.target));
  };
  return reachesSource(target.id) ? "This connection would create a loop." : undefined;
}

export function parseFlowBoard(value: unknown): FlowBoard {
  const board = decodeBoard(value);
  if (new Set(board.nodes.map((node) => node.id)).size !== board.nodes.length)
    throw new Error("Duplicate card IDs.");
  if (new Set(board.edges.map((edge) => edge.id)).size !== board.edges.length)
    throw new Error("Duplicate connection IDs.");
  const accepted: FlowEdge[] = [];
  for (const edge of board.edges) {
    const error = connectionError(board.nodes, accepted, edge);
    if (error) throw new Error(error);
    accepted.push(edge);
  }
  if (board.viewport.zoom < 0.25 || board.viewport.zoom > 1.75)
    throw new Error("Canvas zoom is out of range.");
  if (
    board.nodes.some(
      (node) => Math.abs(node.position.x) > 100000 || Math.abs(node.position.y) > 100000,
    )
  )
    throw new Error("Card position is out of range.");
  for (const node of board.nodes) {
    for (const image of node.libraryImages ?? []) {
      if (
        !!image.url === !!image.assetId ||
        (image.url && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.url))
      )
        throw new Error("Library images must contain one embedded image or saved asset ID.");
    }
    if (
      node.reference &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(node.reference.url)
    )
      throw new Error("Reference images must be embedded PNG, JPEG, or WebP files.");
  }
  return board;
}

export const MAX_FLOW_PROMPT_LENGTH = 100_000;

export function connectedPrompt(board: FlowBoard, node: FlowNode, inputOnly = false): string {
  const nodes = new Map(board.nodes.map((item) => [item.id, item]));
  nodes.set(node.id, node);
  const memo = new Map<string, string>();
  const visiting = new Set<string>();
  const resolve = (item: FlowNode): string => {
    const cached = memo.get(item.id);
    if (cached !== undefined) return cached;
    if (visiting.has(item.id)) throw new Error("Prompt connections contain a loop.");
    visiting.add(item.id);
    const separator =
      item.kind === "combine" && item.separator === "space"
        ? " "
        : item.kind === "combine" && item.separator === "line"
          ? "\n"
          : "\n\n";
    let result = "";
    const append = (fragment: string) => {
      if (fragment && result.length <= MAX_FLOW_PROMPT_LENGTH)
        result = (result + (result ? separator : "") + fragment).slice(
          0,
          MAX_FLOW_PROMPT_LENGTH + 1,
        );
    };
    for (const edge of board.edges) {
      if (edge.target !== item.id || edge.port !== "prompt") continue;
      const source = nodes.get(edge.source);
      if (source) append(resolve(source));
      if (result.length > MAX_FLOW_PROMPT_LENGTH) break;
    }
    append(item.text.trim().slice(0, MAX_FLOW_PROMPT_LENGTH + 1));
    if (item.kind === "updater" && !(inputOnly && item.id === node.id)) {
      result =
        item.rewrite?.source === result && item.rewrite.instructions === (item.instructions ?? "")
          ? item.rewrite.result
          : "";
    }
    visiting.delete(item.id);
    memo.set(item.id, result);
    return result;
  };
  return resolve(node);
}

export const FLOW_COMPONENTS = [
  { kind: "text", label: "Prompt", symbol: "T", description: "Write a reusable brief" },
  { kind: "updater", label: "Prompt updater", symbol: "✦", description: "Enrich a prompt with AI" },
  {
    kind: "library",
    label: "Image library",
    symbol: "▦",
    description: "Collect images for other cards",
  },
  { kind: "image", label: "Image", symbol: "▧", description: "Generate with an image model" },
  { kind: "video", label: "Video", symbol: "▸", description: "Generate video clips" },
  { kind: "reference", label: "Reference", symbol: "↑", description: "Upload a reference image" },
  { kind: "combine", label: "Combine", symbol: "∑", description: "Join prompt fragments" },
  { kind: "note", label: "Note", symbol: "≡", description: "Add direction and reminders" },
] as const;

export const isGenerationNode = (node: FlowNode) =>
  (node.kind === "image" || node.kind === "video") && !node.libraryAsset;

/** Expands library collections in connection order; frame ports use the selected image. */
export function flowMediaSources(
  board: FlowBoard,
  node: FlowNode,
): readonly {
  source: string;
  port: FlowEdge["port"];
  url?: string;
  assetId?: string;
}[] {
  type Media = { source: string; url?: string; assetId?: string };
  const collect = (id: string, path: ReadonlySet<string>): Media[] => {
    if (path.has(id)) throw new Error("Image library connections contain a loop.");
    const item = board.nodes.find((entry) => entry.id === id);
    if (!item) throw new Error("An image source is missing.");
    if (item.kind === "reference") {
      return [{ source: id, ...(item.reference ? { url: item.reference.url } : {}) }];
    }
    if (item.kind !== "library") return [{ source: id }];
    const result: Media[] = (item.libraryImages ?? []).map((image) => ({ source: id, ...image }));
    for (const edge of board.edges.filter(
      (edge) => edge.target === id && edge.port === "reference",
    )) {
      result.push(...collect(edge.source, new Set(path).add(id)));
      if (result.length > 16) throw new Error(`${item.title}: use at most 16 images.`);
    }
    if (!result.length) throw new Error(`${item.title}: add or connect images first.`);
    return result;
  };
  return board.edges
    .filter((edge) => edge.target === node.id && edge.port !== "prompt")
    .flatMap((edge) => {
      const media = collect(edge.source, new Set());
      if (edge.port === "first_frame" || edge.port === "last_frame") {
        const source = board.nodes.find((item) => item.id === edge.source);
        const selected = media[source?.kind === "library" ? source.assetIndex : 0];
        if (!selected) throw new Error(`${source?.title}: select an available frame image.`);
        return [{ ...selected, port: edge.port }];
      }
      return media.map((item) => ({ ...item, port: edge.port }));
    });
}

export function flowExecutionEdges(
  board: FlowBoard,
  nodes: readonly FlowNode[],
): readonly FlowEdge[] {
  return nodes.flatMap((node) =>
    flowMediaSources(board, node).map((item, index) => ({
      id: `${node.id}:${index}`,
      source: item.source,
      target: node.id,
      port: item.port,
    })),
  );
}

function validatePromptUpdaters(
  board: FlowBoard,
  node: FlowNode,
  visited = new Set<string>(),
): void {
  if (visited.has(node.id)) return;
  visited.add(node.id);
  if (node.kind === "updater" && !connectedPrompt(board, node).trim())
    throw new Error(`${node.title}: rewrite the prompt after changing its inputs.`);
  for (const edge of board.edges.filter(
    (edge) => edge.target === node.id && edge.port === "prompt",
  )) {
    const source = board.nodes.find((item) => item.id === edge.source);
    if (source) validatePromptUpdaters(board, source, visited);
  }
}

export function reorderPromptInput(board: FlowBoard, edgeId: string, direction: -1 | 1): FlowBoard {
  const edge = board.edges.find((item) => item.id === edgeId);
  if (!edge || edge.port !== "prompt") return board;
  const inputs = board.edges.filter(
    (item) => item.target === edge.target && item.port === "prompt",
  );
  const adjacent = inputs[inputs.findIndex((item) => item.id === edgeId) + direction];
  if (!adjacent) return board;
  return {
    ...board,
    edges: board.edges.map((item) =>
      item.id === edgeId ? adjacent : item.id === adjacent.id ? edge : item,
    ),
  };
}

export function arrangeFlow(
  board: FlowBoard,
  heights: ReadonlyMap<string, number> = new Map(),
): FlowBoard {
  const depths = new Map<string, number>();
  const depth = (id: string, path = new Set<string>()): number => {
    if (path.has(id)) throw new Error("Disconnect loops before arranging cards.");
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const parents = board.edges.filter((edge) => edge.target === id);
    const result = parents.length
      ? 1 + Math.max(...parents.map((edge) => depth(edge.source, new Set(path).add(id))))
      : 0;
    depths.set(id, result);
    return result;
  };
  const columnY = new Map<number, number>();
  return {
    ...board,
    nodes: board.nodes.map((node) => {
      const column = depth(node.id);
      const y = columnY.get(column) ?? 80;
      columnY.set(column, y + (heights.get(node.id) ?? (isGenerationNode(node) ? 620 : 310)) + 48);
      return { ...node, position: { x: 140 + column * (CARD_WIDTH + 100), y } };
    }),
  };
}

export function workflowStarter(
  kind: "compare" | "reference" | "motion",
  offset: { x: number; y: number },
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const prompt = {
    ...newFlowNode("text", offset),
    text:
      kind === "reference"
        ? "Describe the subject to preserve and what should change."
        : "Describe your subject, setting, lighting, and composition.",
  };
  const image = newFlowNode("image", { x: offset.x + 420, y: offset.y });
  const edge = (source: FlowNode, target: FlowNode, port: FlowEdge["port"]): FlowEdge => ({
    id: randomUUID(),
    source: source.id,
    target: target.id,
    port,
  });
  if (kind === "compare") {
    const second = {
      ...newFlowNode("image", { x: offset.x + 420, y: offset.y + 660 }),
      title: "Alternative model",
    };
    return {
      nodes: [prompt, image, second],
      edges: [edge(prompt, image, "prompt"), edge(prompt, second, "prompt")],
    };
  }
  if (kind === "reference") {
    const reference = newFlowNode("reference", { x: offset.x, y: offset.y + 330 });
    return {
      nodes: [prompt, reference, image],
      edges: [edge(prompt, image, "prompt"), edge(reference, image, "reference")],
    };
  }
  const video = newFlowNode("video", { x: offset.x + 840, y: offset.y });
  return {
    nodes: [prompt, image, video],
    edges: [
      edge(prompt, image, "prompt"),
      edge(prompt, video, "prompt"),
      edge(image, video, "first_frame"),
    ],
  };
}

/** Returns dependency waves, reusing completed upstream cards for a single-card run. */
export function planFlow(
  board: FlowBoard,
  requested: readonly string[],
  hasOutput: (id: string) => boolean,
): readonly (readonly FlowNode[])[] {
  const dependencies = new Map<string, readonly string[]>();
  const required = new Set<string>();
  const visit = (id: string) => {
    if (required.has(id)) return;
    const node = board.nodes.find((entry) => entry.id === id);
    if (!node || !isGenerationNode(node)) return;
    required.add(id);
    const sources = flowMediaSources(board, node).map((item) => item.source);
    dependencies.set(id, sources);
    for (const source of sources) {
      if (requested.includes(source) || !hasOutput(source)) visit(source);
    }
  };
  requested.forEach(visit);
  const waves: FlowNode[][] = [];
  const done = new Set<string>();
  while (done.size < required.size) {
    const wave = board.nodes.filter(
      (node) =>
        required.has(node.id) &&
        !done.has(node.id) &&
        (dependencies.get(node.id) ?? []).every(
          (source) => !required.has(source) || done.has(source),
        ),
    );
    if (!wave.length) throw new Error("Disconnect the circular dependency before running.");
    waves.push(wave);
    wave.forEach((node) => done.add(node.id));
  }
  return waves;
}

type Reference = { readonly port: FlowEdge["port"]; readonly url: string };
export function imageFlowInput(
  board: FlowBoard,
  node: FlowNode,
  model: ImageGenerationModel,
  refs: readonly Reference[],
): ImageGenerationInput {
  validatePromptUpdaters(board, node);
  if (!node.image || model.id !== node.image.model)
    throw new Error(`${node.title}: choose an available image model.`);
  const prompt = connectedPrompt(board, node);
  if (prompt.length > MAX_FLOW_PROMPT_LENGTH)
    throw new Error(`${node.title}: shorten the combined prompt to 100,000 characters or fewer.`);
  if (!prompt) throw new Error(`${node.title}: connect a prompt or enter instructions.`);
  if (model.civitai?.checkpoint === "required" && !node.image.civitai?.checkpoint)
    throw new Error(`${node.title}: choose a checkpoint in Advanced settings.`);
  for (const [key, value] of [
    ["n", node.image.n],
    ["aspect_ratio", node.image.aspectRatio],
    ["resolution", node.image.resolution],
    ["size", node.image.size],
    ["quality", node.image.quality],
    ["output_format", node.image.outputFormat],
    ["seed", node.image.seed],
    ["background", node.image.background],
    ["output_compression", node.image.outputCompression],
  ] as const) {
    if (value === undefined) continue;
    const descriptor = model.supportedParameters[key];
    if (
      !descriptor ||
      (descriptor.type === "enum" && !descriptor.values.includes(String(value))) ||
      (descriptor.type === "range" &&
        (typeof value !== "number" || value < descriptor.min || value > descriptor.max))
    ) {
      throw new Error(
        `${node.title}: ${key.replaceAll("_", " ")} is not supported by this model. Update the card settings.`,
      );
    }
  }
  if (node.image.seed !== undefined && !Number.isSafeInteger(node.image.seed))
    throw new Error(`${node.title}: seed must be an integer.`);
  const references = [...(node.image.inputReferences ?? []), ...refs.map(({ url }) => ({ url }))];
  if (references.length && !model.supportedParameters.input_references)
    throw new Error(`${node.title}: this model does not accept reference images.`);
  const bounds = referenceImageBounds(model.supportedParameters.input_references);
  if (references.length < bounds.min || references.length > bounds.max)
    throw new Error(
      `${node.title}: this model accepts ${bounds.min}–${bounds.max} reference images.`,
    );
  const { inputReferences: _previousReferences, ...settings } = node.image;
  return {
    ...settings,
    prompt,
    ...(references.length ? { inputReferences: references } : {}),
  };
}

export function videoFlowInput(
  board: FlowBoard,
  node: FlowNode,
  model: VideoGenerationModel,
  refs: readonly Reference[],
): VideoGenerationInput {
  validatePromptUpdaters(board, node);
  if (!node.video) throw new Error(`${node.title}: choose a video model.`);
  const {
    frameImages: _previousFrames,
    inputReferences: _previousReferences,
    ...settings
  } = node.video;
  const input: VideoGenerationInput = {
    ...settings,
    prompt: connectedPrompt(board, node),
    ...(refs.length
      ? {
          frameImages: refs.map(({ port, url }) => ({
            url,
            frameType: port === "last_frame" ? ("last_frame" as const) : ("first_frame" as const),
          })),
        }
      : {}),
  };
  if (input.prompt.length > MAX_FLOW_PROMPT_LENGTH)
    throw new Error(`${node.title}: shorten the combined prompt to 100,000 characters or fewer.`);
  if (!input.prompt) throw new Error(`${node.title}: connect a prompt or enter instructions.`);
  const error = videoGenerationInputError(input, model);
  if (error) throw new Error(`${node.title}: ${error}`);
  return input;
}

export function screenToCanvas(
  point: { x: number; y: number },
  viewport: FlowBoard["viewport"],
): { x: number; y: number } {
  return { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom };
}

export function zoomAt(
  viewport: FlowBoard["viewport"],
  zoom: number,
  point: { x: number; y: number },
): FlowBoard["viewport"] {
  const next = Math.max(0.25, Math.min(1.75, zoom));
  const world = screenToCanvas(point, viewport);
  return { x: point.x - world.x * next, y: point.y - world.y * next, zoom: next };
}
