import { useFlowSheets } from "./useFlowSheets";
import { FlowNodeLibrary } from "./FlowNodeLibrary";
import type { FlowSheet } from "./flowSheets";
import { UtilityFlowCard } from "./UtilityFlowCard";
import { flowLibraryPreview } from "./flowLibraryPreview";
import { readFlowReference } from "./flowReference";
import {
  FLOW_COMPONENTS,
  arrangeFlow,
  isGenerationNode,
  workflowStarter,
  reorderPromptInput,
  flowMediaSources,
  flowExecutionEdges,
} from "./flowModel";
import { executeFlowPlan } from "./flowExecution";
import { randomUUID } from "../../lib/utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  ImageGenerationRecord,
  VideoGenerationModel,
  VideoGenerationRecord,
} from "@t3tools/contracts";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { createImageContentLoader } from "../imageContentLoader";
import { GalleryPanel } from "./GalleryPanel";
import { useImageLibrary } from "../useImageLibrary";
import type { ImageGenerationInput } from "@t3tools/contracts";
import "./studio.css";
import { FlowCard, type FlowStatus, type ImageCatalog } from "./FlowCard";
import {
  CARD_WIDTH,
  PORT_Y,
  connectedPrompt,
  connectionError,
  imageFlowInput,
  newFlowNode,
  parseFlowBoard,
  planFlow,
  screenToCanvas,
  videoFlowInput,
  zoomAt,
  type FlowBoard,
  type FlowEdge,
  type FlowNode,
} from "./flowModel";
import { useFlowBoard } from "./useFlowBoard";
import { flowApi } from "./flowApi";
import "./flow.css";

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request could not be completed.";
const terminalVideo = (record: VideoGenerationRecord) =>
  ["completed", "failed", "cancelled", "expired"].includes(record.status);
type Gesture = {
  pointer: number;
  start: { x: number; y: number };
  viewport: FlowBoard["viewport"];
  node?: FlowNode;
};

export function FlowWorkspace() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId ? (
    <SheetWorkspace key={environmentId} environmentId={environmentId} />
  ) : (
    <div className="zf-disconnected">Connect an environment to open ZImage.</div>
  );
}

function SheetWorkspace({ environmentId }: { readonly environmentId: string }) {
  const { state, session } = useFlowSheets(environmentId);
  const sheet = state.sheets.find((item) => item.id === state.activeId);
  if (!state.ready || !sheet)
    return (
      <div className="zf-disconnected" role="status">
        {state.error || "Loading saved canvases…"}
        {state.error && (
          <button type="button" onClick={() => void session.initialize()}>
            Retry
          </button>
        )}
      </div>
    );
  return <EnvironmentFlowWorkspace key={sheet.id} environmentId={environmentId} sheet={sheet} />;
}

function EnvironmentFlowWorkspace({
  environmentId,
  sheet,
}: {
  readonly environmentId: string;
  readonly sheet: FlowSheet;
}) {
  const { state: sheetsState, session } = useFlowSheets(environmentId);
  const {
    board,
    current,
    change,
    checkpoint,
    undo,
    redo,
    canUndo,
    canRedo,
    saveError,
    restoring,
    saved,
    replace,
    flush,
  } = useFlowBoard(sheet, session.refresh);
  const removeLibraryGeneration = useImageLibrary().removeGeneration;
  const [catalogs, setCatalogs] = useState<readonly ImageCatalog[]>([]);
  const [videoModels, setVideoModels] = useState<readonly VideoGenerationModel[]>([]);
  const [images, setImages] = useState<readonly ImageGenerationRecord[]>([]);
  const [videos, setVideos] = useState<readonly VideoGenerationRecord[]>([]);
  const imageRecords = useRef(images);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const library = sheetsState.libraryOpen;
  const setLibrary = session.setLibrary;
  const [help, setHelp] = useState(false);
  const [nodeLibrary, setNodeLibrary] = useState(false);
  const [boardSettings, setBoardSettings] = useState(false);
  const [libraryLimit, setLibraryLimit] = useState(18);
  const [selection, setSelection] = useState<string | null>(null);
  const [connection, setConnection] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [statuses, setStatuses] = useState<Readonly<Record<string, FlowStatus>>>({});
  const [generating, setBusy] = useState(false);
  const busy = generating || sheetsState.transitioning;
  const running = useRef(false);
  useEffect(
    () =>
      session.registerEditor(sheet.id, async () => {
        if (running.current)
          throw new Error("Finish or stop the current run before changing canvases.");
        await flush();
      }),
    [flush, session, sheet.id],
  );
  useEffect(() => {
    session.setGenerating(generating);
  }, [generating, session]);
  const stop = useRef(false);
  const [stopping, setStopping] = useState(false);
  const lifetime = useRef(new AbortController());
  const [reload, setReload] = useState(0);
  const surface = useRef<HTMLDivElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const loader = useMemo(
    () => createImageContentLoader((id) => flowApi.content(id, lifetime.current.signal)),
    [lifetime],
  );

  useEffect(() => {
    if (lifetime.current.signal.aborted) lifetime.current = new AbortController();
    return () => {
      lifetime.current.abort();
      stop.current = true;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void Promise.allSettled([
      flowApi.imageModels("openrouter", controller.signal),
      flowApi.imageModels("civitai", controller.signal),
      flowApi.videoModels(controller.signal),
      flowApi.images(controller.signal),
      flowApi.videos(controller.signal),
      flowApi.imageModels("fal", controller.signal),
      flowApi.videoModels(controller.signal, "fal"),
    ]).then(([openrouter, civitai, video, imageHistory, videoHistory, fal, falVideo]) => {
      if (controller.signal.aborted) return;
      setCatalogs([
        ...(openrouter.status === "fulfilled"
          ? openrouter.value.models.map((model) => ({
              model,
              provider: "openrouter",
            }))
          : []),
        ...(civitai.status === "fulfilled"
          ? civitai.value.models.map((model) => ({
              model,
              provider: "civitai",
            }))
          : []),
        ...(fal.status === "fulfilled"
          ? fal.value.models.map((model) => ({ model, provider: "fal" }))
          : []),
      ]);
      setVideoModels([
        ...(video.status === "fulfilled" ? video.value.models : []),
        ...(falVideo.status === "fulfilled" ? falVideo.value.models : []),
      ]);
      if (imageHistory.status === "fulfilled") {
        imageRecords.current = imageHistory.value.generations;
        setImages(imageHistory.value.generations);
      }
      if (videoHistory.status === "fulfilled") setVideos(videoHistory.value.generations);
      if (imageHistory.status === "rejected" || videoHistory.status === "rejected")
        setNotice(
          "Some library assets could not load. Retry before running cards that use saved outputs.",
        );
      else if (
        openrouter.status === "rejected" &&
        civitai.status === "rejected" &&
        fal.status === "rejected"
      )
        setNotice(
          "Image models could not load. Check your provider credentials in Settings, then retry.",
        );
      else if (video.status === "rejected" && falVideo.status === "rejected")
        setNotice(
          "Video models are unavailable. Check your provider credentials in Settings, then retry.",
        );
      setLoading(false);
    });
    return () => controller.abort();
  }, [reload]);

  const hasPendingVideo = videos.some((record) => !terminalVideo(record));
  useEffect(() => {
    if (!hasPendingVideo) return;
    const controller = new AbortController();
    let inFlight = false;
    const timer = window.setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void flowApi
        .videos(controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setVideos(result.generations);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setNotice("Video status could not refresh. Retry to reconnect to your jobs.");
        })
        .finally(() => {
          inFlight = false;
        });
    }, 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [hasPendingVideo]);

  const updateNode = useCallback(
    (id: string, patch: Partial<FlowNode>) => {
      change((value) => ({
        ...value,
        nodes: value.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
      }));
      setStatuses((value) => {
        const next = { ...value };
        delete next[id];
        return next;
      });
    },
    [change],
  );
  const remove = useCallback(
    (id: string) => {
      checkpoint();
      change((value) => ({
        ...value,
        nodes: value.nodes.filter((node) => node.id !== id),
        edges: value.edges.filter((edge) => edge.source !== id && edge.target !== id),
      }));
      setSelection(null);
      setConnection(null);
    },
    [change, checkpoint],
  );
  const duplicate = useCallback(
    (id: string) => {
      const node = current.current.nodes.find((item) => item.id === id);
      if (!node || current.current.nodes.length >= 100) return;
      if (
        current.current.edges.length +
          current.current.edges.filter((edge) => edge.target === id).length >
        400
      ) {
        setNotice("This canvas supports up to 400 connections.");
        return;
      }
      const copy = {
        ...node,
        id: randomUUID(),
        title: `${node.title} copy`,
        position: {
          x: node.position.x + CARD_WIDTH + 64,
          y: node.position.y + 40,
        },
        generationIds: node.libraryAsset ? node.generationIds : [],
        assetIndex: 0,
      };
      checkpoint();
      change((value) => ({
        ...value,
        nodes: [...value.nodes, copy],
        edges: [
          ...value.edges,
          ...value.edges
            .filter((edge) => edge.target === node.id)
            .map((edge) => ({ ...edge, id: randomUUID(), target: copy.id })),
        ],
      }));
      setSelection(copy.id);
    },
    [change, checkpoint, current],
  );
  const pointInSurface = useCallback((x: number, y: number) => {
    const bounds = surface.current?.getBoundingClientRect();
    return { x: x - (bounds?.left ?? 0), y: y - (bounds?.top ?? 0) };
  }, []);
  const add = useCallback(
    (kind: FlowNode["kind"], point?: { x: number; y: number }) => {
      if (current.current.nodes.length >= 100) {
        setNotice("This canvas supports up to 100 cards.");
        return;
      }
      const rect = surface.current?.getBoundingClientRect();
      const position = screenToCanvas(
        point ?? {
          x: Math.max(80, (rect?.width ?? 800) / 2 - 158),
          y: Math.max(80, (rect?.height ?? 600) / 2 - 180),
        },
        current.current.viewport,
      );
      const node = newFlowNode(kind, position);
      checkpoint();
      change((value) => ({ ...value, nodes: [...value.nodes, node] }));
      setSelection(node.id);
    },
    [change, checkpoint, current],
  );
  const connect = useCallback(
    (id: string, port: FlowEdge["port"] | "output", dragSource?: string) => {
      if (port === "output") {
        const node = current.current.nodes.find((item) => item.id === id);
        if (node)
          setPointer({
            x: node.position.x + CARD_WIDTH + 60,
            y: node.position.y + 67,
          });
        setConnection((value) => (value === id ? null : id));
        return;
      }
      const source = dragSource ?? connection;
      if (!source) {
        setNotice("Select an output port first, then select this input port.");
        return;
      }
      const edge = { id: randomUUID(), source, target: id, port };
      const error = connectionError(current.current.nodes, current.current.edges, edge);
      if (error) {
        setNotice(error);
        return;
      }
      checkpoint();
      change((value) => ({ ...value, edges: [...value.edges, edge] }));
      setConnection(null);
      setNotice("");
    },
    [change, checkpoint, connection, current],
  );

  const beginDrag = useCallback(
    (event: ReactPointerEvent, node: FlowNode) => {
      if (running.current || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      setSelection(node.id);
      surface.current?.focus();
      surface.current?.setPointerCapture(event.pointerId);
      checkpoint();
      gesture.current = {
        pointer: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        viewport: current.current.viewport,
        node,
      };
    },
    [checkpoint, current],
  );

  const snap = (value: number) =>
    current.current.settings?.snapToGrid ? Math.round(value / 24) * 24 : value;
  const measuredHeights = () =>
    new Map(
      Array.from(surface.current?.querySelectorAll<HTMLElement>("[data-node-id]") ?? []).map(
        (element) => [element.dataset.nodeId ?? "", element.offsetHeight],
      ),
    );
  const addReferenceFiles = async (files: File[], position: { x: number; y: number }) => {
    if (running.current) return;
    const available = 100 - current.current.nodes.length;
    if (files.length > Math.min(available, 8)) {
      setNotice("Drop up to eight reference images at once, within the 100-card limit.");
      return;
    }
    const results = await Promise.allSettled(files.map(readFlowReference));
    if (lifetime.current.signal.aborted || running.current) return;
    const nodes = results.flatMap((result, index) =>
      result.status === "fulfilled"
        ? [
            {
              ...newFlowNode("reference", {
                x: position.x + index * 350,
                y: position.y,
              }),
              reference: result.value,
              title: result.value.name,
            },
          ]
        : [],
    );
    if (current.current.nodes.length + nodes.length > 100) {
      setNotice("This canvas supports up to 100 cards.");
      return;
    }
    checkpoint();
    change((value) => ({ ...value, nodes: [...value.nodes, ...nodes] }));
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") setNotice(messageOf(failure.reason));
  };
  const addStarter = (kind: "compare" | "reference" | "motion") => {
    if (busy) return;
    const starter = workflowStarter(kind, screenToCanvas({ x: 150, y: 100 }, board.viewport));
    if (
      board.nodes.length + starter.nodes.length > 100 ||
      board.edges.length + starter.edges.length > 400
    ) {
      setNotice("There is not enough room in this canvas for another starter.");
      return;
    }
    checkpoint();
    change((value) => ({
      ...value,
      nodes: [...value.nodes, ...starter.nodes],
      edges: [...value.edges, ...starter.edges],
    }));
    setBoardSettings(false);
    setSelection(starter.nodes[0]?.id ?? null);
  };
  const fit = () => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect || !board.nodes.length) return;
    const left = Math.min(...board.nodes.map((node) => node.position.x));
    const top = Math.min(...board.nodes.map((node) => node.position.y));
    const right = Math.max(...board.nodes.map((node) => node.position.x + CARD_WIDTH));
    const heights = measuredHeights();
    const bottom = Math.max(
      ...board.nodes.map((node) => node.position.y + (heights.get(node.id) ?? 400)),
    );
    const zoom = Math.max(
      0.25,
      Math.min(1, (rect.width - 100) / (right - left), (rect.height - 100) / (bottom - top)),
    );
    change(
      (value) => ({
        ...value,
        viewport: {
          x: (rect.width - (right - left) * zoom) / 2 - left * zoom,
          y: 50 - top * zoom,
          zoom,
        },
      }),
      false,
    );
  };
  const zoom = useCallback(
    (amount: number) => {
      const rect = surface.current?.getBoundingClientRect();
      change(
        (value) => ({
          ...value,
          viewport: zoomAt(value.viewport, value.viewport.zoom + amount, {
            x: (rect?.width ?? 800) / 2,
            y: (rect?.height ?? 600) / 2,
          }),
        }),
        false,
      );
    },
    [change],
  );
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("textarea,select,.zf-advanced") &&
        !event.ctrlKey &&
        !event.metaKey
      )
        return;
      event.preventDefault();
      const point = pointInSurface(event.clientX, event.clientY);
      change(
        (value) => ({
          ...value,
          viewport:
            event.ctrlKey || event.metaKey
              ? zoomAt(value.viewport, value.viewport.zoom * Math.exp(-event.deltaY * 0.008), point)
              : {
                  ...value.viewport,
                  x: value.viewport.x - event.deltaX,
                  y: value.viewport.y - event.deltaY,
                },
        }),
        false,
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [change, pointInSurface, restoring]);

  const run = useCallback(
    async (ids: readonly string[]) => {
      if (running.current || loading) return;
      const snapshot = current.current;
      const output = (id: string) => {
        const node = current.current.nodes.find((item) => item.id === id);
        return node
          ? imageRecords.current
              .filter((record) => node.generationIds.includes(record.id))
              .flatMap((record) => record.assets)[node.assetIndex]
          : undefined;
      };
      const modelFor = (node: FlowNode) =>
        catalogs.find(
          (entry) =>
            entry.provider === (node.image?.providerInstanceId ?? "openrouter") &&
            entry.model.id === node.image?.model,
        )?.model;
      const videoModelFor = (node: FlowNode) =>
        videoModels.find((model) => model.id === node.video?.model);
      let waves: ReturnType<typeof planFlow>;
      try {
        waves = planFlow(snapshot, ids, (id) => !!output(id));
        if (!waves.length) throw new Error("Add an image or video generation card first.");
        for (const wave of waves)
          for (const node of wave) {
            const refs = flowMediaSources(snapshot, node).map((edge) => {
              const source = snapshot.nodes.find((item) => item.id === edge.source);
              if (source?.kind === "reference" && !source.reference)
                throw new Error(`${source.title}: upload a reference image first.`);
              if (source?.libraryAsset && !output(source.id))
                throw new Error(`${source.title}: library image is unavailable.`);
              if (
                edge.assetId &&
                !imageRecords.current.some((record) =>
                  record.assets.some((asset) => asset.id === edge.assetId),
                )
              )
                throw new Error(`${source?.title}: a saved library image is unavailable.`);
              return {
                port: edge.port,
                url: "https://example.invalid/preflight.png",
              };
            });
            if (node.kind === "image") {
              const model = modelFor(node);
              if (!model) throw new Error(`${node.title}: choose an available image model.`);
              imageFlowInput(snapshot, node, model, refs);
            } else {
              const model = videoModelFor(node);
              if (!model) throw new Error(`${node.title}: choose an available video model.`);
              videoFlowInput(snapshot, node, model, refs);
            }
          }
      } catch (cause) {
        setNotice(messageOf(cause));
        return;
      }
      running.current = true;
      stop.current = false;
      setBusy(true);
      setStopping(false);
      setConnection(null);
      setNotice("");
      setStatuses(
        Object.fromEntries(
          waves.flat().map((node) => [node.id, { state: "queued", message: "Queued" }]),
        ),
      );
      const setStatus = (id: string, status: FlowStatus) => {
        if (!lifetime.current.signal.aborted) setStatuses((value) => ({ ...value, [id]: status }));
      };
      const execute = async (node: FlowNode) => {
        if (stop.current || lifetime.current.signal.aborted) return;
        const dependencies = flowMediaSources(snapshot, node);
        setStatus(node.id, { state: "running", message: "Generating…" });
        {
          const refs = await Promise.all(
            dependencies.map(async (edge) => {
              if (edge.url) return { port: edge.port, url: edge.url };
              const source = snapshot.nodes.find((item) => item.id === edge.source);
              if (source?.kind === "reference" && source.reference)
                return { port: edge.port, url: source.reference.url };
              const asset = edge.assetId ? { id: edge.assetId } : output(edge.source);
              if (!asset) throw new Error("An upstream image has no available output.");
              const content = await loader.load(asset.id);
              return {
                port: edge.port,
                url: `data:${content.mediaType};base64,${content.data}`,
              };
            }),
          );
          if (stop.current || lifetime.current.signal.aborted) {
            setStatus(node.id, { state: "error", message: "Stopped before generation." });
            return;
          }
          if (node.kind === "image") {
            const model = modelFor(node);
            if (!model) throw new Error("Image model unavailable.");
            const result = await flowApi.image(
              imageFlowInput(snapshot, node, model, refs),
              lifetime.current.signal,
            );
            if (lifetime.current.signal.aborted) return;
            imageRecords.current = [
              result,
              ...imageRecords.current.filter((record) => record.id !== result.id),
            ];
            setImages(imageRecords.current);
            change(
              (value) => ({
                ...value,
                nodes: value.nodes.map((item) =>
                  item.id === node.id
                    ? { ...item, generationIds: [result.id], assetIndex: 0 }
                    : item,
                ),
              }),
              false,
            );
            if (!result.assets.length) throw new Error("The provider returned no images.");
            setStatus(node.id, {
              state: "done",
              message: `${result.assets.length} image${result.assets.length === 1 ? "" : "s"} ready`,
            });
          } else {
            const model = videoModelFor(node);
            if (!model) throw new Error("Video model unavailable.");
            const input = videoFlowInput(snapshot, node, model, refs);
            const generationIds: string[] = [];
            for (let index = 0; index < node.videoCount && !stop.current; index++) {
              const result = await flowApi.video(input, lifetime.current.signal);
              if (lifetime.current.signal.aborted) return;
              generationIds.push(result.id);
              setVideos((value) => [result, ...value.filter((record) => record.id !== result.id)]);
              change(
                (value) => ({
                  ...value,
                  nodes: value.nodes.map((item) =>
                    item.id === node.id
                      ? { ...item, generationIds: [...generationIds], assetIndex: 0 }
                      : item,
                  ),
                }),
                false,
              );
            }
            setStatus(node.id, {
              state: "done",
              message: `${generationIds.length} video job${generationIds.length === 1 ? "" : "s"} submitted. Status updates automatically.`,
            });
          }
        }
      };
      try {
        await executeFlowPlan(waves, flowExecutionEdges(snapshot, waves.flat()), {
          shouldStop: () => stop.current || lifetime.current.signal.aborted,
          execute,
          onError: (node, cause) =>
            setStatus(node.id, { state: "error", message: messageOf(cause) }),
          onSkipped: (node) =>
            setStatus(node.id, { state: "error", message: "Skipped: an upstream image failed." }),
        });
      } finally {
        running.current = false;
        if (!lifetime.current.signal.aborted) {
          setBusy(false);
          setStopping(false);
          setStatuses((value) =>
            Object.fromEntries(
              Object.entries(value).map(([id, status]) => [
                id,
                status.state === "queued"
                  ? { state: "error", message: "Stopped before generation." }
                  : status,
              ]),
            ),
          );
          if (stop.current)
            setNotice("Stopped scheduling new work. Submitted jobs remain in the library.");
        }
      }
    },
    [catalogs, change, current, lifetime, loader, loading, videoModels],
  );

  const runNode = useCallback(
    (id: string) => {
      void run([id]);
    },
    [run],
  );

  const importAsset = (
    record: ImageGenerationRecord | VideoGenerationRecord,
    kind: "image" | "video",
    assetIndex = 0,
  ) => {
    if (board.nodes.length >= 100) {
      setNotice("This canvas supports up to 100 cards.");
      return;
    }
    const node = {
      ...newFlowNode(kind, screenToCanvas({ x: 140, y: 140 }, board.viewport)),
      title: record.model.split("/").at(-1) ?? "Library asset",
      libraryAsset: true,
      generationIds: [record.id],
      assetIndex,
    };
    checkpoint();
    change((value) => ({ ...value, nodes: [...value.nodes, node] }));
    setSelection(node.id);
    setLibrary(false);
  };
  const reuseImage = (input: ImageGenerationInput, generate: boolean) => {
    if (running.current || board.nodes.length >= 100) return;
    const node = {
      ...newFlowNode("image", screenToCanvas({ x: 180, y: 140 }, board.viewport)),
      title: input.model.split("/").at(-1) ?? "Image",
      text: input.prompt,
      image: input,
    };
    checkpoint();
    change((value) => ({ ...value, nodes: [...value.nodes, node] }));
    setSelection(node.id);
    setLibrary(false);
    if (generate) void run([node.id]);
  };
  const exportBoard = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(board, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${board.title.replace(/[^a-z0-9-]/gi, "_") || "zimage"}.zimage.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const selectedNode = board.nodes.find((node) => node.id === selection);
  const selectedEdges = board.edges.filter(
    (edge) => edge.source === selection || edge.target === selection,
  );
  const connectionNode = board.nodes.find((node) => node.id === connection);
  const path = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const bend = Math.max(70, Math.abs(to.x - from.x) * 0.45);
    return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
  };

  if (restoring)
    return (
      <div className="zf-disconnected" role="status">
        Restoring your canvas…
      </div>
    );

  return (
    <section className="zf-workspace" aria-label="ZImage canvas">
      <header className="zf-topbar">
        <div className="zf-brand">
          <strong>ZImage</strong>
          <span>/</span>
          <input
            aria-label="Canvas name"
            value={board.title}
            maxLength={80}
            disabled={busy}
            onChange={(event) => change((value) => ({ ...value, title: event.target.value }))}
          />
        </div>
        <div className="zf-top-actions">
          <button
            type="button"
            onClick={() => setNodeLibrary(!nodeLibrary)}
            aria-expanded={nodeLibrary}
          >
            Add node
          </button>
          <span
            className="zf-save-state"
            title="The canvas is saved in this browser, separately for each environment."
          >
            {saveError ? "Not saved" : saved ? "Saved on this device" : "Saving…"}
          </span>
          <button type="button" onClick={() => setLibrary(!library)} aria-pressed={library}>
            Library
          </button>
          <button
            type="button"
            onClick={() => setBoardSettings(!boardSettings)}
            aria-expanded={boardSettings}
          >
            Canvas
          </button>
          <button type="button" onClick={exportBoard}>
            Export
          </button>
          <button type="button" disabled={busy} onClick={() => importInput.current?.click()}>
            Import
          </button>
          <button
            type="button"
            className="zf-run"
            disabled={loading || stopping}
            onClick={() => {
              if (busy) {
                stop.current = true;
                setStopping(true);
              } else void run(board.nodes.filter(isGenerationNode).map((node) => node.id));
            }}
          >
            {busy ? (stopping ? "Finishing current…" : "Stop after current") : "Run canvas ↗"}
          </button>
        </div>
      </header>
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > 32_000_000) {
            setNotice(
              "Workflow files must be smaller than 32 MB. Remove embedded references from oversized workflows.",
            );
            return;
          }
          void file
            .text()
            .then((text) => {
              const next = parseFlowBoard(JSON.parse(text) as unknown);
              replace(next);
              setSelection(null);
              setConnection(null);
              setStatuses({});
              setNotice(
                "Workflow imported. Output IDs refer to assets in the connected environment.",
              );
            })
            .catch((cause) => setNotice(`Import failed: ${messageOf(cause)}`));
        }}
      />
      {(notice || saveError) && (
        <div className="zf-notice" role="status">
          <span>{saveError || notice}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setNotice("");
              setReload((value) => value + 1);
            }}
          >
            Retry loading
          </button>
          <button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      <div className="zf-body">
        <nav className="zf-tools" aria-label="Canvas components">
          <span className="zf-toolbar-label">ADD</span>
          {FLOW_COMPONENTS.map(({ kind, label, symbol, description }) => (
            <button
              type="button"
              key={kind}
              disabled={busy}
              draggable={!busy}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/x-zimage-node", kind);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => add(kind)}
              title={`${description}. Drag onto canvas or click to add.`}
            >
              <span aria-hidden="true">{symbol}</span>
              {label}
            </button>
          ))}
          <div className="zf-tool-divider" />
          <button
            type="button"
            disabled={busy || !canUndo}
            onClick={undo}
            title="Undo (Ctrl/Cmd+Z)"
          >
            ↶<small>Undo</small>
          </button>
          <button
            type="button"
            disabled={busy || !canRedo}
            onClick={redo}
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            ↷<small>Redo</small>
          </button>
          <button type="button" onClick={() => setHelp(!help)} aria-expanded={help}>
            ?<small>Help</small>
          </button>
        </nav>
        <div
          ref={surface}
          className="zf-surface"
          tabIndex={0}
          role="region"
          aria-label="Workflow canvas. Drag the background to pan. Use zoom controls. Select a card and use arrow keys to move it."
          onDragOver={(event) => {
            if (
              event.dataTransfer.types.includes("application/x-zimage-node") ||
              event.dataTransfer.types.includes("Files")
            ) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (busy) return;
            const kind = event.dataTransfer.getData("application/x-zimage-node");
            const component = FLOW_COMPONENTS.find((item) => item.kind === kind);
            if (component) add(component.kind, pointInSurface(event.clientX, event.clientY));
            else if (event.dataTransfer.files.length) {
              const position = screenToCanvas(
                pointInSurface(event.clientX, event.clientY),
                current.current.viewport,
              );
              void addReferenceFiles(Array.from(event.dataTransfer.files), position);
            }
          }}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget || event.button !== 0) return;
            setSelection(null);
            surface.current?.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            gesture.current = {
              pointer: event.pointerId,
              start: { x: event.clientX, y: event.clientY },
              viewport: current.current.viewport,
            };
          }}
          onPointerMove={(event) => {
            if (connection)
              setPointer(
                screenToCanvas(
                  pointInSurface(event.clientX, event.clientY),
                  current.current.viewport,
                ),
              );
            const active = gesture.current;
            if (!active || active.pointer !== event.pointerId) return;
            const dx = event.clientX - active.start.x;
            const dy = event.clientY - active.start.y;
            if (active.node) {
              const node = active.node;
              change((value) => ({
                ...value,
                nodes: value.nodes.map((item) =>
                  item.id === node.id
                    ? {
                        ...item,
                        position: {
                          x: snap(node.position.x + dx / active.viewport.zoom),
                          y: snap(node.position.y + dy / active.viewport.zoom),
                        },
                      }
                    : item,
                ),
              }));
            } else
              change(
                (value) => ({
                  ...value,
                  viewport: {
                    ...active.viewport,
                    x: active.viewport.x + dx,
                    y: active.viewport.y + dy,
                  },
                }),
                false,
              );
          }}
          onPointerUp={(event) => {
            gesture.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            checkpoint();
          }}
          onPointerCancel={() => {
            gesture.current = null;
            checkpoint();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setConnection(null);
              setSelection(null);
              return;
            }
            if (
              event.target instanceof HTMLElement &&
              event.target.closest("input,textarea,select,button,summary")
            )
              return;
            if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              event.stopPropagation();
              zoom(0.1);
            }
            if (event.key === "-") {
              event.preventDefault();
              event.stopPropagation();
              zoom(-0.1);
            }
            if (busy) return;
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
              event.preventDefault();
              event.stopPropagation();
              if (event.shiftKey) redo();
              else undo();
            }
            if ((event.key === "Delete" || event.key === "Backspace") && selection) {
              event.preventDefault();
              event.stopPropagation();
              remove(selection);
            }
            if (
              selectedNode &&
              ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
            ) {
              event.preventDefault();
              event.stopPropagation();
              const step = event.shiftKey ? 40 : 10;
              updateNode(selectedNode.id, {
                position: {
                  x:
                    selectedNode.position.x +
                    (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
                  y:
                    selectedNode.position.y +
                    (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
                },
              });
            }
          }}
        >
          <div
            className="zf-world"
            style={{
              transform: `translate(${board.viewport.x}px, ${board.viewport.y}px) scale(${board.viewport.zoom})`,
            }}
          >
            <svg
              className="zf-lines"
              aria-hidden="true"
              style={{
                visibility:
                  board.settings?.showConnections === false && !connection ? "hidden" : "visible",
              }}
            >
              {board.edges.map((edge) => {
                const source = board.nodes.find((node) => node.id === edge.source);
                const target = board.nodes.find((node) => node.id === edge.target);
                if (!source || !target) return null;
                return (
                  <path
                    key={edge.id}
                    data-port={edge.port}
                    className={
                      edge.source === selection || edge.target === selection
                        ? "zf-line-selected"
                        : ""
                    }
                    d={path(
                      { x: source.position.x + CARD_WIDTH, y: source.position.y + 67 },
                      { x: target.position.x, y: target.position.y + PORT_Y[edge.port] },
                    )}
                  />
                );
              })}
              {connectionNode && (
                <path
                  className="zf-line-draft"
                  d={path(
                    {
                      x: connectionNode.position.x + CARD_WIDTH,
                      y: connectionNode.position.y + 67,
                    },
                    pointer,
                  )}
                />
              )}
            </svg>
            {board.nodes.map((node) => {
              const Card = ["reference", "combine", "note", "updater", "library"].includes(
                node.kind,
              )
                ? UtilityFlowCard
                : FlowCard;
              return (
                <Card
                  key={node.id}
                  node={node}
                  selected={selection === node.id}
                  disabled={busy}
                  catalogs={catalogs}
                  videoModels={videoModels}
                  images={images}
                  {...(node.kind === "library"
                    ? {
                        libraryPreview: flowLibraryPreview(board, node, images),
                      }
                    : {})}
                  videos={videos}
                  status={statuses[node.id]}
                  connected={connectedPrompt(board, { ...node, text: "" }, node.kind === "updater")}
                  pendingConnection={connection !== null}
                  loadImage={loader.load}
                  onChange={updateNode}
                  onSelect={setSelection}
                  onDrag={beginDrag}
                  onPort={connect}
                  onRun={runNode}
                  onDuplicate={duplicate}
                  onRemove={remove}
                />
              );
            })}
          </div>
          {!board.nodes.length && (
            <div className="zf-empty-canvas">
              <span>YOUR NEXT FRAME STARTS HERE</span>
              <h2>Make room for an idea.</h2>
              <p>Add a prompt, connect a model, and follow the result.</p>
              <button type="button" disabled={busy} onClick={() => add("text")}>
                Add a prompt
              </button>
            </div>
          )}
        </div>
        <div className="zf-view-controls">
          <button type="button" onClick={() => zoom(-0.1)} aria-label="Zoom out">
            −
          </button>
          <span>{Math.round(board.viewport.zoom * 100)}%</span>
          <button type="button" onClick={() => zoom(0.1)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={fit}>
            Fit
          </button>
        </div>
        <div className="zf-canvas-caption">
          {connection
            ? "Select an input port to connect · Esc to cancel"
            : loading
              ? "Loading models and library…"
              : `${board.nodes.length} nodes · ${board.edges.length} connections${busy ? ` · ${Object.values(statuses).filter((status) => status.state === "queued").length} queued` : ""}`}
        </div>
        {nodeLibrary && (
          <FlowNodeLibrary disabled={busy} onAdd={add} onClose={() => setNodeLibrary(false)} />
        )}
        {selectedNode && selectedEdges.length > 0 && (
          <aside className="zf-connections" aria-label="Selected card connections">
            <strong>Connections</strong>
            {selectedEdges.map((edge) => (
              <div key={edge.id}>
                <span>
                  {board.nodes.find((node) => node.id === edge.source)?.title} →{" "}
                  {board.nodes.find((node) => node.id === edge.target)?.title}
                  <small>{edge.port.replaceAll("_", " ")}</small>
                </span>
                {edge.port === "prompt" && edge.target === selection && (
                  <div className="zf-input-order">
                    <button
                      type="button"
                      aria-label="Move prompt earlier"
                      disabled={
                        busy ||
                        board.edges.find(
                          (item) => item.target === edge.target && item.port === "prompt",
                        )?.id === edge.id
                      }
                      onClick={() => {
                        checkpoint();
                        change((value) => reorderPromptInput(value, edge.id, -1));
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Move prompt later"
                      disabled={
                        busy ||
                        board.edges.findLast(
                          (item) => item.target === edge.target && item.port === "prompt",
                        )?.id === edge.id
                      }
                      onClick={() => {
                        checkpoint();
                        change((value) => reorderPromptInput(value, edge.id, 1));
                      }}
                    >
                      ↓
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`Disconnect ${edge.port}`}
                  disabled={busy}
                  onClick={() => {
                    checkpoint();
                    change((value) => ({
                      ...value,
                      edges: value.edges.filter((item) => item.id !== edge.id),
                    }));
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </aside>
        )}
        {boardSettings && (
          <aside className="zf-help zf-board-settings">
            <header>
              <strong>Canvas settings</strong>
              <button
                type="button"
                aria-label="Close canvas settings"
                onClick={() => setBoardSettings(false)}
              >
                ×
              </button>
            </header>
            <label>
              <input
                type="checkbox"
                checked={board.settings?.snapToGrid ?? false}
                onChange={(event) =>
                  change((value) => ({
                    ...value,
                    settings: {
                      showConnections: value.settings?.showConnections ?? true,
                      snapToGrid: event.target.checked,
                    },
                  }))
                }
              />{" "}
              Snap cards to grid
            </label>
            <label>
              <input
                type="checkbox"
                checked={board.settings?.showConnections ?? true}
                onChange={(event) =>
                  change((value) => ({
                    ...value,
                    settings: {
                      snapToGrid: value.settings?.snapToGrid ?? false,
                      showConnections: event.target.checked,
                    },
                  }))
                }
              />{" "}
              Show connections
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                checkpoint();
                change((value) => arrangeFlow(value, measuredHeights()));
              }}
            >
              Arrange by workflow
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                checkpoint();
                change((value) => ({
                  ...value,
                  nodes: value.nodes.map((node) => ({ ...node, collapsed: true })),
                }));
              }}
            >
              Collapse all cards
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                checkpoint();
                change((value) => ({
                  ...value,
                  nodes: value.nodes.map((node) => ({ ...node, collapsed: false })),
                }));
              }}
            >
              Expand all cards
            </button>
            <strong className="zf-settings-heading">Add a workflow starter</strong>
            <button type="button" disabled={busy} onClick={() => addStarter("compare")}>
              Compare two models <small>One prompt, two image cards</small>
            </button>
            <button type="button" disabled={busy} onClick={() => addStarter("reference")}>
              Reference to image <small>A reference, a prompt, and a model</small>
            </button>
            <button type="button" disabled={busy} onClick={() => addStarter("motion")}>
              Image to motion <small>Generate a still, then animate it</small>
            </button>
          </aside>
        )}
        {help && (
          <aside className="zf-help">
            <header>
              <strong>Working on the canvas</strong>
              <button type="button" onClick={() => setHelp(false)} aria-label="Close help">
                ×
              </button>
            </header>
            <p>
              Drag a component from the toolbar, or click to add it. Move cards by their header.
            </p>
            <p>
              Click the port on the right of a prompt or image, then an input on another card. Hover
              or focus a port to identify it.
            </p>
            <p>
              Connect one prompt to multiple image cards to compare models. Duplicate a card to keep
              its input connections.
            </p>
            <p>
              Image outputs can feed reference inputs or a video’s first and last frames. The
              selected output is used.
            </p>
            <p>
              Run canvas regenerates all generation cards. Running one card reuses existing upstream
              images and generates missing ones.
            </p>
            <p>
              Drag the background to pan. Ctrl/Cmd + scroll zooms. Select a card and focus the
              canvas to move it with arrow keys, or delete it with Delete.
            </p>
            <p>
              Layouts save on this device per environment. Export transfers the workflow; media
              stays in the environment library.
            </p>
          </aside>
        )}
        {library && (
          <aside className="zf-library">
            <header>
              <div>
                <strong>Asset library</strong>
                <p>Bring previous work into your canvas.</p>
              </div>
              <button type="button" onClick={() => setLibrary(false)} aria-label="Close library">
                ×
              </button>
            </header>
            <div className="zf-library-scroll">
              {!loading && images.length === 0 && videos.length === 0 && (
                <p>No generated assets yet.</p>
              )}
              <GalleryPanel
                generations={images}
                visibleCount={libraryLimit}
                isLoading={loading}
                isGenerating={busy}
                pendingInput={null}
                loadImageContent={loader.load}
                onDelete={async (id) => {
                  if (running.current) {
                    setNotice("Finish the current run before deleting assets.");
                    return;
                  }
                  try {
                    await flowApi.deleteImage(id, lifetime.current.signal);
                    const record = imageRecords.current.find((item) => item.id === id);
                    record?.assets.forEach((asset) => loader.delete(asset.id));
                    imageRecords.current = imageRecords.current.filter((item) => item.id !== id);
                    setImages(imageRecords.current);
                    removeLibraryGeneration(id);
                  } catch (cause) {
                    setNotice(messageOf(cause));
                  }
                }}
                onReuse={(input) => reuseImage(input, false)}
                onReroll={(input) => reuseImage(input, true)}
                onUseReference={async (assetId) => {
                  const record = images.find((item) =>
                    item.assets.some((asset) => asset.id === assetId),
                  );
                  if (record)
                    importAsset(
                      record,
                      "image",
                      record.assets.findIndex((asset) => asset.id === assetId),
                    );
                }}
                onCancel={() => {
                  stop.current = true;
                  setStopping(true);
                }}
                onLoadMore={() => setLibraryLimit((value) => value + 18)}
                canLoadMore={images.length > libraryLimit}
                onUseStarter={(text) => {
                  if (busy || board.nodes.length >= 100) return;
                  const node = {
                    ...newFlowNode("text", screenToCanvas({ x: 160, y: 120 }, board.viewport)),
                    text,
                  };
                  checkpoint();
                  change((value) => ({ ...value, nodes: [...value.nodes, node] }));
                  setLibrary(false);
                }}
              />
              {videos.slice(0, libraryLimit).map((record) => (
                <div className="zf-library-item" key={record.id}>
                  <span>
                    {record.model} · {record.status}
                  </span>
                  <p>{record.prompt}</p>
                  {record.assets.length > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => importAsset(record, "video")}
                    >
                      Add video to canvas
                    </button>
                  )}
                </div>
              ))}
              {Math.max(images.length, videos.length) > libraryLimit && (
                <button type="button" onClick={() => setLibraryLimit((value) => value + 18)}>
                  Show more assets
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
