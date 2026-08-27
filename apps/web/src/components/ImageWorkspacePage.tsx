import {
  Code2Icon,
  ImageIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Effect from "effect/Effect";

import {
  OPENROUTER_GPT_IMAGE_2_MODEL,
  OPENROUTER_GPT_IMAGE_2_PROVIDER,
  type ImageGenerationInput,
  type ImageGenerationModel,
  type ImageGenerationModelEndpoints,
  type ImageGenerationRecord,
} from "@t3tools/contracts";

import { PrimaryEnvironmentHttpClient } from "../environments/primary/httpClient";
import { runPrimaryHttp } from "../lib/runtime";
import { Button } from "./ui/button";
import type { ReferenceImage } from "./ReferenceImageDropzone";
import { VideoWorkspacePanel } from "./VideoWorkspacePanel";
import { createImageContentLoader } from "./imageContentLoader";
import {
  parseImageGenerationPayload,
  serializeImageGenerationPayload,
} from "../lib/imageGenerationPayload";
import {
  clampEnumValue,
  clampNumberValue,
  countOptionsFor,
  referenceImageBounds,
} from "../lib/imageModelCapabilities";
import {
  clearPromptHistory,
  loadPromptHistory,
  persistPromptHistory,
  pickStarterPrompt,
  pushPromptHistory,
} from "../lib/imageStudioPrefs";
import { PromptPanel } from "./imageStudio/PromptPanel";
import { SettingsPanel } from "./imageStudio/SettingsPanel";
import { GalleryPanel } from "./imageStudio/GalleryPanel";

type ImageOutputFormat = "png" | "jpeg" | "webp" | "svg";
type ImageQuality = "auto" | "low" | "medium" | "high";
type ImageBackground = "auto" | "transparent" | "opaque";

const GENERATION_WINDOW_SIZE = 24;

function modelSupports(
  supportedParameters: ImageGenerationModel["supportedParameters"],
  parameter: string,
): boolean {
  return supportedParameters[parameter] !== undefined;
}
function referenceImageFromUrl(url: string, index: number): ReferenceImage {
  const mediaType = url.startsWith("data:")
    ? url.slice(5, url.indexOf(";") > 0 ? url.indexOf(";") : url.indexOf(",")) || "image/png"
    : "image/*";
  const encodedData = url.startsWith("data:") ? url.slice(url.indexOf(",") + 1) : "";

  return {
    id: `json-reference-${index}`,
    name: `Reference ${index + 1}`,
    mediaType,
    dataUrl: url,
    sizeBytes: Math.floor((encodedData.length * 3) / 4),
  };
}

export function ImageWorkspacePage() {
  const [mode, setMode] = useState<"image" | "video">("image");
  const [models, setModels] = useState<ReadonlyArray<ImageGenerationModel>>([]);
  const [generations, setGenerations] = useState<ReadonlyArray<ImageGenerationRecord>>([]);
  const [visibleGenerationCount, setVisibleGenerationCount] = useState(GENERATION_WINDOW_SIZE);
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [quality, setQuality] = useState<ImageQuality>("auto");
  const [resolution, setResolution] = useState("");
  const [size, setSize] = useState("");
  const [background, setBackground] = useState<ImageBackground>("auto");
  const [outputCompression, setOutputCompression] = useState(85);
  const [seed, setSeed] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReadonlyArray<ReferenceImage>>([]);
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>("png");
  const [useStreaming, setUseStreaming] = useState(false);
  const [count, setCount] = useState(1);
  const [modelEndpoints, setModelEndpoints] = useState<ImageGenerationModelEndpoints | null>(null);
  const [selectedEndpointIndex, setSelectedEndpointIndex] = useState("");
  const [providerOptionsJson, setProviderOptionsJson] = useState("");
  const [providerOverride, setProviderOverride] = useState<ImageGenerationInput["provider"]>();
  const [editorMode, setEditorMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [promptHistory, setPromptHistory] = useState<ReadonlyArray<string>>(() =>
    loadPromptHistory(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEndpoints, setIsLoadingEndpoints] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingGenerationInput, setPendingGenerationInput] = useState<ImageGenerationInput | null>(
    null,
  );
  const [generationAnnouncement, setGenerationAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeGenerationRef = useRef<AbortController | null>(null);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === modelId) ?? models[0] ?? null,
    [modelId, models],
  );
  const selectedEndpoint = useMemo(() => {
    if (!modelEndpoints || selectedEndpointIndex === "") return null;
    return modelEndpoints.endpoints[Number(selectedEndpointIndex)] ?? null;
  }, [modelEndpoints, selectedEndpointIndex]);
  const supportedParameters =
    selectedEndpoint?.supportedParameters ?? selectedModel?.supportedParameters ?? {};
  const isGptImage2Model = modelId === OPENROUTER_GPT_IMAGE_2_MODEL;
  const supportsStreaming =
    selectedEndpoint?.supportsStreaming ?? selectedModel?.supportsStreaming ?? false;
  const { min: minReferenceImages, max: maxReferenceImages } = referenceImageBounds(
    supportedParameters.input_references,
  );
  const noAvailableEndpoints = modelEndpoints !== null && modelEndpoints.endpoints.length === 0;
  const countOptions = countOptionsFor(supportedParameters.n);

  const buildImageGenerationInput = useCallback(() => {
    let provider: Record<string, unknown> | undefined = isGptImage2Model
      ? { only: [OPENROUTER_GPT_IMAGE_2_PROVIDER], allow_fallbacks: false }
      : providerOverride
        ? { ...providerOverride }
        : undefined;
    if (!isGptImage2Model && !provider && selectedEndpoint?.providerTag) {
      provider = { only: [selectedEndpoint.providerTag], allow_fallbacks: false };
    }
    if (providerOptionsJson.trim()) {
      let options: unknown;
      try {
        options = JSON.parse(providerOptionsJson) as unknown;
      } catch {
        return { error: "Provider options must be valid JSON." } as const;
      }
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        return { error: "Provider options must be a JSON object." } as const;
      }
      if (selectedEndpoint) {
        const unsupportedKeys = Object.keys(options).filter(
          (key) => !selectedEndpoint.allowedPassthroughParameters.includes(key),
        );
        if (unsupportedKeys.length > 0) {
          return { error: `Unsupported provider option: ${unsupportedKeys.join(", ")}.` } as const;
        }
      }
      const providerKey = selectedEndpoint?.providerSlug ?? selectedEndpoint?.providerTag;
      if (!providerKey) {
        return {
          error: "This endpoint does not expose a provider slug for provider options.",
        } as const;
      }
      provider = {
        ...provider,
        options: { [providerKey]: options },
      };
    }

    const input: ImageGenerationInput = {
      model: modelId,
      prompt: prompt.trim(),
      ...(modelSupports(supportedParameters, "n") ? { n: count } : {}),
      ...(supportsStreaming && useStreaming ? { stream: true } : {}),
      ...(modelSupports(supportedParameters, "aspect_ratio") ? { aspectRatio } : {}),
      ...(resolution && modelSupports(supportedParameters, "resolution") ? { resolution } : {}),
      ...(modelSupports(supportedParameters, "quality") ? { quality } : {}),
      ...(modelSupports(supportedParameters, "output_format") ? { outputFormat } : {}),
      ...(size && modelSupports(supportedParameters, "size") ? { size } : {}),
      ...(modelSupports(supportedParameters, "background") ? { background } : {}),
      ...(modelSupports(supportedParameters, "output_compression") ? { outputCompression } : {}),
      ...(seed.trim() && modelSupports(supportedParameters, "seed") ? { seed: Number(seed) } : {}),
      ...(modelSupports(supportedParameters, "input_references") && referenceImages.length > 0
        ? {
            inputReferences: referenceImages.map((image) => ({ url: image.dataUrl })),
          }
        : {}),
      ...(provider ? { provider } : {}),
    };

    return { input } as const;
  }, [
    aspectRatio,
    background,
    count,
    isGptImage2Model,
    modelId,
    outputCompression,
    outputFormat,
    prompt,
    providerOverride,
    providerOptionsJson,
    referenceImages,
    resolution,
    seed,
    selectedEndpoint,
    size,
    supportedParameters,
    supportsStreaming,
    useStreaming,
    quality,
  ]);

  const loadGenerations = useCallback(async () => {
    const result = await runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) => client.imageGeneration.generations({ headers: {} })),
      ),
    );
    setGenerations(result.generations);
    return result.generations;
  }, []);

  const imageContentLoader = useMemo(
    () =>
      createImageContentLoader((assetId) =>
        runPrimaryHttp(
          PrimaryEnvironmentHttpClient.pipe(
            Effect.flatMap((client) =>
              client.imageGeneration.assetContent({ params: { id: assetId }, headers: {} }),
            ),
          ),
        ),
      ),
    [],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [modelResult] = await Promise.all([
        runPrimaryHttp(
          PrimaryEnvironmentHttpClient.pipe(
            Effect.flatMap((client) => client.imageGeneration.models({ headers: {} })),
          ),
        ),
        loadGenerations(),
      ]);
      setModels(modelResult.models);
      setModelId((current) => current || modelResult.models[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the image workspace.");
    } finally {
      setIsLoading(false);
    }
  }, [loadGenerations]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedModel) {
      setModelEndpoints(null);
      return;
    }
    const [author, slug] = selectedModel.id.split("/", 2);
    if (!author || !slug) {
      setModelEndpoints(null);
      return;
    }

    let cancelled = false;
    setIsLoadingEndpoints(true);
    void runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) =>
          client.imageGeneration.modelEndpoints({ params: { author, slug }, headers: {} }),
        ),
      ),
    )
      .then((result) => {
        if (!cancelled) setModelEndpoints(result);
      })
      .catch(() => {
        if (!cancelled) setModelEndpoints(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEndpoints(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedModel]);

  // Keep the form in sync with the selected model's capabilities. Switching
  // models can leave values behind that the new model rejects, so clamp every
  // parameter to what the model's endpoints actually accept.
  useEffect(() => {
    if (!selectedModel) return;
    setQuality((current) => clampEnumValue(supportedParameters.quality, current) as ImageQuality);
    setOutputFormat(
      (current) => clampEnumValue(supportedParameters.output_format, current) as ImageOutputFormat,
    );
    setBackground(
      (current) => clampEnumValue(supportedParameters.background, current) as ImageBackground,
    );
    setAspectRatio((current) => clampEnumValue(supportedParameters.aspect_ratio, current));
    setCount((current) => clampNumberValue(supportedParameters.n, current, 1, 10));
    setOutputCompression((current) =>
      clampNumberValue(supportedParameters.output_compression, current, 0, 100),
    );
    setReferenceImages((current) =>
      current.length > maxReferenceImages ? current.slice(0, maxReferenceImages) : current,
    );
  }, [selectedModel, supportedParameters, maxReferenceImages]);

  const cancelGeneration = useCallback(() => {
    const controller = activeGenerationRef.current;
    if (!controller) return;

    activeGenerationRef.current = null;
    controller.abort();
    setIsGenerating(false);
    setPendingGenerationInput(null);
    setGenerationAnnouncement("Image generation cancelled.");
  }, []);

  useEffect(
    () => () => {
      const controller = activeGenerationRef.current;
      if (!controller) return;

      activeGenerationRef.current = null;
      controller.abort();
    },
    [],
  );

  const generate = useCallback(
    async (inputOverride?: ImageGenerationInput) => {
      if (activeGenerationRef.current) return;

      let input: ImageGenerationInput;
      if (inputOverride) {
        input = inputOverride;
      } else {
        if (!modelId || prompt.trim().length === 0) {
          setError("Choose an image model and enter a prompt.");
          return;
        }
        if (referenceImages.length < minReferenceImages) {
          setError(
            `This model requires at least ${minReferenceImages} reference image${
              minReferenceImages === 1 ? "" : "s"
            }.`,
          );
          return;
        }
        const inputResult = buildImageGenerationInput();
        if ("error" in inputResult) {
          setError(inputResult.error);
          return;
        }
        input = inputResult.input;
      }

      const controller = new AbortController();
      activeGenerationRef.current = controller;
      setPendingGenerationInput(input);
      setIsGenerating(true);
      setGenerationAnnouncement(
        `Generating ${input.n ?? 1} image${(input.n ?? 1) === 1 ? "" : "s"}. This may take a moment.`,
      );
      setError(null);

      try {
        const result = await runPrimaryHttp(
          PrimaryEnvironmentHttpClient.pipe(
            Effect.flatMap((client) =>
              client.imageGeneration.generate({ payload: input, headers: {} }),
            ),
          ),
          { signal: controller.signal },
        );
        if (activeGenerationRef.current !== controller || controller.signal.aborted) return;

        setGenerations((current) => [result, ...current]);
        setGenerationAnnouncement(
          `${result.assets.length} image${result.assets.length === 1 ? " is" : "s are"} ready.`,
        );
        setPrompt("");
        setPromptHistory((current) => {
          const next = pushPromptHistory(current, input.prompt);
          persistPromptHistory(next);
          return next;
        });
      } catch (cause) {
        if (activeGenerationRef.current !== controller || controller.signal.aborted) return;

        setGenerationAnnouncement("");
        setError(cause instanceof Error ? cause.message : "Image generation failed.");
      } finally {
        if (activeGenerationRef.current === controller) {
          activeGenerationRef.current = null;
          setPendingGenerationInput(null);
          setIsGenerating(false);
        }
      }
    },
    [buildImageGenerationInput, minReferenceImages, modelId, prompt, referenceImages.length],
  );

  const generateRef = useRef(generate);
  generateRef.current = generate;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (editorMode !== "form") return;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void generateRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editorMode]);

  const deleteGeneration = useCallback(
    async (id: string) => {
      try {
        await runPrimaryHttp(
          PrimaryEnvironmentHttpClient.pipe(
            Effect.flatMap((client) =>
              client.imageGeneration.deleteGeneration({ params: { id }, headers: {} }),
            ),
          ),
        );
        setGenerations((current) => {
          const deletedGeneration = current.find((generation) => generation.id === id);
          for (const asset of deletedGeneration?.assets ?? []) {
            imageContentLoader.delete(asset.id);
          }
          return current.filter((generation) => generation.id !== id);
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not delete the generation.");
      }
    },
    [imageContentLoader],
  );

  const applyImageGenerationInput = useCallback((input: ImageGenerationInput) => {
    setModelId(input.model);
    setSelectedEndpointIndex("");
    setPrompt(input.prompt);
    setAspectRatio(input.aspectRatio ?? "1:1");
    setQuality(input.quality ?? "auto");
    setResolution(input.resolution ?? "");
    setSize(input.size ?? "");
    setBackground(input.background ?? "auto");
    setOutputCompression(input.outputCompression ?? 85);
    setSeed(input.seed === undefined ? "" : String(input.seed));
    setOutputFormat(input.outputFormat ?? "png");
    setUseStreaming(input.stream ?? false);
    setCount(input.n ?? 1);
    setReferenceImages(
      input.inputReferences?.map((reference, index) =>
        referenceImageFromUrl(reference.url, index),
      ) ?? [],
    );
    setProviderOverride(input.provider);
    setProviderOptionsJson("");
  }, []);

  const rerollGeneration = useCallback(
    (input: ImageGenerationInput) => {
      const supportsSeed = modelSupports(supportedParameters, "seed");
      const rerolled: ImageGenerationInput = supportsSeed
        ? { ...input, seed: Math.floor(Math.random() * 1_000_000) }
        : input;
      applyImageGenerationInput(rerolled);
      setEditorMode("form");
      setJsonError(null);
      setError(null);
      void generate(rerolled);
    },
    [applyImageGenerationInput, generate, supportedParameters],
  );

  const switchEditorMode = (nextMode: "form" | "json") => {
    if (nextMode === "json") {
      const result = buildImageGenerationInput();
      if ("input" in result) {
        setJsonText(serializeImageGenerationPayload(result.input));
        setJsonError(null);
      } else {
        setJsonError(result.error);
      }
    }
    setEditorMode(nextMode);
  };

  const applyJsonPayload = () => {
    const result = parseImageGenerationPayload(jsonText);
    if ("error" in result) {
      setJsonError(result.error);
      return;
    }
    applyImageGenerationInput(result.input);
    setJsonError(null);
    setError(null);
    setEditorMode("form");
    setGenerationAnnouncement("JSON settings applied to the image form.");
  };

  const handleModelChange = useCallback((nextModelId: string) => {
    setSelectedEndpointIndex("");
    setProviderOverride(undefined);
    setProviderOptionsJson("");
    setUseStreaming(false);
    setModelId(nextModelId);
  }, []);

  const handleSurprise = useCallback(() => {
    setPrompt((current) => pickStarterPrompt(current));
  }, []);

  const restorePrompt = useCallback((entry: string) => {
    setPrompt(entry);
    setEditorMode("form");
    setError(null);
  }, []);

  const handleClearHistory = useCallback(() => {
    clearPromptHistory();
    setPromptHistory([]);
  }, []);

  const handleUseStarter = useCallback((starter: string) => {
    setPrompt(starter);
    setEditorMode("form");
    setError(null);
    requestAnimationFrame(() => document.getElementById("zimage-prompt")?.focus());
  }, []);

  if (mode === "video") {
    return <VideoWorkspacePanel onModeChange={() => setMode("image")} />;
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background text-foreground">
      <header className="border-b border-border/70 bg-muted/20 px-5 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-fuchsia-500">
              <ImageIcon className="size-4" aria-hidden="true" />
              ZImage
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Image studio</h1>
          </div>
          <div className="flex items-center gap-1 border border-border/70 bg-background/70 p-1">
            <Button size="sm" className="gap-2">
              <ImageIcon className="size-3.5" aria-hidden="true" /> Images
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode("video")} className="gap-2">
              Video
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void load()}
              aria-label="Refresh image workspace"
            >
              <RefreshCwIcon className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <p className="sr-only" role="status">
          {generationAnnouncement}
        </p>
        {error ? (
          <p
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <GalleryPanel
            generations={generations}
            visibleCount={visibleGenerationCount}
            isLoading={isLoading}
            isGenerating={isGenerating}
            pendingInput={pendingGenerationInput}
            loadImageContent={imageContentLoader.load}
            onDelete={deleteGeneration}
            onReuse={(input) => {
              applyImageGenerationInput(input);
              setEditorMode("form");
              setJsonError(null);
              setError(null);
              setGenerationAnnouncement("Image settings loaded into the form.");
            }}
            onReroll={rerollGeneration}
            onCancel={cancelGeneration}
            onLoadMore={() =>
              setVisibleGenerationCount((current) => current + GENERATION_WINDOW_SIZE)
            }
            canLoadMore={generations.length > visibleGenerationCount}
            onUseStarter={handleUseStarter}
            className="order-last lg:order-none"
          />

          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0 lg:max-h-dvh lg:overflow-y-auto lg:py-1">
            <div
              className="flex items-center gap-1 self-start border border-border/70 bg-background/70 p-1"
              role="tablist"
              aria-label="Image editor view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={editorMode === "form"}
                onClick={() => switchEditorMode("form")}
                className={`inline-flex h-8 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${editorMode === "form" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Settings2Icon className="size-3.5" aria-hidden="true" />
                Form
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={editorMode === "json"}
                onClick={() => switchEditorMode("json")}
                className={`inline-flex h-8 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${editorMode === "json" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Code2Icon className="size-3.5" aria-hidden="true" />
                JSON
              </button>
            </div>

            {editorMode === "form" ? (
              <>
                <PromptPanel
                  prompt={prompt}
                  onChange={setPrompt}
                  onSurprise={handleSurprise}
                  history={promptHistory}
                  onRestorePrompt={restorePrompt}
                  onClearHistory={handleClearHistory}
                  disabled={isGenerating}
                />
                <SettingsPanel
                  models={models}
                  modelId={modelId}
                  onModelChange={handleModelChange}
                  modelEndpoints={modelEndpoints}
                  selectedEndpointIndex={selectedEndpointIndex}
                  onEndpointChange={(value) => {
                    setSelectedEndpointIndex(value);
                    setProviderOverride(undefined);
                    setProviderOptionsJson("");
                    setUseStreaming(false);
                  }}
                  isLoadingEndpoints={isLoadingEndpoints}
                  isGptImage2Model={isGptImage2Model}
                  supportedParameters={supportedParameters}
                  aspectRatio={aspectRatio}
                  onAspectRatioChange={setAspectRatio}
                  resolution={resolution}
                  onResolutionChange={setResolution}
                  size={size}
                  onSizeChange={setSize}
                  quality={quality}
                  onQualityChange={setQuality}
                  outputFormat={outputFormat}
                  onOutputFormatChange={setOutputFormat}
                  background={background}
                  onBackgroundChange={setBackground}
                  count={count}
                  onCountChange={setCount}
                  countOptions={countOptions}
                  seed={seed}
                  onSeedChange={setSeed}
                  onRandomizeSeed={() => setSeed(String(Math.floor(Math.random() * 1_000_000)))}
                  outputCompression={outputCompression}
                  onOutputCompressionChange={setOutputCompression}
                  useStreaming={useStreaming}
                  onUseStreamingChange={setUseStreaming}
                  supportsStreaming={supportsStreaming}
                  referenceImages={referenceImages}
                  onReferenceImagesChange={setReferenceImages}
                  minReferenceImages={minReferenceImages}
                  maxReferenceImages={maxReferenceImages}
                  selectedEndpoint={selectedEndpoint}
                  providerOptionsJson={providerOptionsJson}
                  onProviderOptionsChange={(value) => {
                    setProviderOverride(undefined);
                    setProviderOptionsJson(value);
                  }}
                  noAvailableEndpoints={noAvailableEndpoints}
                  disabled={isGenerating}
                />
                <Button
                  onClick={() => void generate()}
                  disabled={
                    isGenerating ||
                    isLoading ||
                    !modelId ||
                    prompt.trim().length === 0 ||
                    noAvailableEndpoints
                  }
                  className="h-11 w-full gap-2 text-base"
                >
                  {isGenerating ? (
                    <LoaderCircleIcon className="size-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <SparklesIcon className="size-5" aria-hidden="true" />
                  )}
                  {isGenerating ? "Generating..." : "Generate"}
                </Button>
              </>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-border/70 bg-card/40 p-4 shadow-sm/5">
                  <label htmlFor="zimage-json" className="text-sm font-medium">
                    Reusable JSON payload
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Paste an image payload copied from a generation, then apply it to the form.
                  </p>
                  <textarea
                    id="zimage-json"
                    value={jsonText}
                    onChange={(event) => {
                      setJsonText(event.target.value);
                      setJsonError(null);
                    }}
                    className="mt-3 min-h-72 w-full resize-y border border-border/80 bg-muted/20 p-4 font-mono text-xs leading-relaxed text-foreground outline-hidden transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                    spellCheck={false}
                    disabled={isGenerating}
                    aria-describedby="zimage-json-help"
                  />
                  {jsonError ? (
                    <p className="mt-2 text-sm text-destructive" role="alert">
                      {jsonError}
                    </p>
                  ) : null}
                  <p
                    id="zimage-json-help"
                    className="mt-3 text-[11px] leading-relaxed text-muted-foreground"
                  >
                    JSON exports include the model, full prompt, and every supported setting used by
                    the generation. Older generations without saved settings still import with their
                    model and prompt.
                  </p>
                  <Button
                    onClick={applyJsonPayload}
                    disabled={isGenerating || jsonText.trim().length === 0}
                    className="mt-4 w-full"
                  >
                    Apply to form
                  </Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
