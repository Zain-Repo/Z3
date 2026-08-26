import { ImageIcon, LoaderCircleIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Effect from "effect/Effect";

import type {
  ImageGenerationInput,
  ImageGenerationModel,
  ImageGenerationModelEndpoints,
  ImageGenerationRecord,
} from "@t3tools/contracts";

import { PrimaryEnvironmentHttpClient } from "../environments/primary/httpClient";
import { runPrimaryHttp } from "../lib/runtime";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { GenerationCard, PendingGenerationCard } from "./ImageGenerationGallery";
import { ReferenceImageDropzone, type ReferenceImage } from "./ReferenceImageDropzone";
import { VideoWorkspacePanel } from "./VideoWorkspacePanel";
import { createImageContentLoader } from "./imageContentLoader";

type ImageOutputFormat = "png" | "jpeg" | "webp" | "svg";
type ImageQuality = "auto" | "low" | "medium" | "high";
type ImageBackground = "auto" | "transparent" | "opaque";

const DEFAULT_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];
const DEFAULT_QUALITIES: ReadonlyArray<ImageQuality> = ["auto", "low", "medium", "high"];
const DEFAULT_BACKGROUNDS: ReadonlyArray<ImageBackground> = ["auto", "transparent", "opaque"];
const GENERATION_WINDOW_SIZE = 24;
const defaultOptionLabel = (option: string) => option;

function modelSupports(
  supportedParameters: ImageGenerationModel["supportedParameters"],
  parameter: string,
): boolean {
  return supportedParameters[parameter] !== undefined;
}

function modelEnumValues(
  supportedParameters: ImageGenerationModel["supportedParameters"],
  parameter: string,
  fallback: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const descriptor = supportedParameters[parameter];
  return descriptor?.type === "enum" && descriptor.values.length > 0 ? descriptor.values : fallback;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEndpoints, setIsLoadingEndpoints] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationAnnouncement, setGenerationAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === modelId) ?? models[0] ?? null,
    [modelId, models],
  );
  const selectedEndpoint = useMemo(() => {
    if (!modelEndpoints || selectedEndpointIndex === "") return null;
    return modelEndpoints.endpoints[Number(selectedEndpointIndex)] ?? null;
  }, [modelEndpoints, selectedEndpointIndex]);
  const visibleGenerations = useMemo(
    () => generations.slice(0, visibleGenerationCount),
    [generations, visibleGenerationCount],
  );
  const supportedParameters =
    selectedEndpoint?.supportedParameters ?? selectedModel?.supportedParameters ?? {};
  const supportsStreaming =
    selectedEndpoint?.supportsStreaming ?? selectedModel?.supportsStreaming ?? false;
  const maxReferenceImages = (() => {
    const descriptor = supportedParameters.input_references;
    return descriptor?.type === "range" && Number.isFinite(descriptor.max)
      ? Math.max(1, Math.floor(descriptor.max))
      : 4;
  })();

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
    setSelectedEndpointIndex("");
    setProviderOptionsJson("");
    setUseStreaming(false);
  }, [selectedModel?.id]);

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

  const generate = async () => {
    if (!modelId || prompt.trim().length === 0) {
      setError("Choose an image model and enter a prompt.");
      return;
    }

    let provider: Record<string, unknown> | undefined;
    if (selectedEndpoint?.providerTag) {
      provider = { only: [selectedEndpoint.providerTag], allow_fallbacks: false };
    }
    if (providerOptionsJson.trim()) {
      let options: unknown;
      try {
        options = JSON.parse(providerOptionsJson) as unknown;
      } catch {
        setError("Provider options must be valid JSON.");
        return;
      }
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        setError("Provider options must be a JSON object.");
        return;
      }
      if (selectedEndpoint) {
        const unsupportedKeys = Object.keys(options).filter(
          (key) => !selectedEndpoint.allowedPassthroughParameters.includes(key),
        );
        if (unsupportedKeys.length > 0) {
          setError(`Unsupported provider option: ${unsupportedKeys.join(", ")}.`);
          return;
        }
      }
      const providerKey = selectedEndpoint?.providerSlug ?? selectedEndpoint?.providerTag;
      if (!providerKey) {
        setError("This endpoint does not expose a provider slug for provider options.");
        return;
      }
      provider = {
        ...provider,
        options: { [providerKey]: options },
      };
    }

    setIsGenerating(true);
    setGenerationAnnouncement(
      `Generating ${count} image${count === 1 ? "" : "s"}. This may take a moment.`,
    );
    setError(null);
    const input: ImageGenerationInput = {
      model: modelId,
      prompt: prompt.trim(),
      n: count,
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

    try {
      const result = await runPrimaryHttp(
        PrimaryEnvironmentHttpClient.pipe(
          Effect.flatMap((client) =>
            client.imageGeneration.generate({ payload: input, headers: {} }),
          ),
        ),
      );
      setGenerations((current) => [result, ...current]);
      setGenerationAnnouncement(
        `${result.assets.length} image${result.assets.length === 1 ? " is" : "s are"} ready.`,
      );
      setPrompt("");
    } catch (cause) {
      setGenerationAnnouncement("");
      setError(cause instanceof Error ? cause.message : "Image generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

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

  const observeGenerationSentinel = useCallback((sentinel: HTMLDivElement | null) => {
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleGenerationCount((current) => current + GENERATION_WINDOW_SIZE);
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const aspectRatios = modelEnumValues(supportedParameters, "aspect_ratio", DEFAULT_ASPECT_RATIOS);
  const resolutions = modelEnumValues(supportedParameters, "resolution", ["512", "1K", "2K", "4K"]);
  const sizes = modelEnumValues(supportedParameters, "size", [
    "1024x1024",
    "1536x1024",
    "1024x1536",
  ]);
  const qualityOptions = modelEnumValues(supportedParameters, "quality", DEFAULT_QUALITIES).filter(
    (value): value is ImageQuality => DEFAULT_QUALITIES.includes(value as ImageQuality),
  );
  const backgroundOptions = modelEnumValues(
    supportedParameters,
    "background",
    DEFAULT_BACKGROUNDS,
  ).filter((value): value is ImageBackground =>
    DEFAULT_BACKGROUNDS.includes(value as ImageBackground),
  );
  const formatOptions = modelEnumValues(supportedParameters, "output_format", [
    "png",
    "jpeg",
    "webp",
    "svg",
  ]).filter((value): value is ImageOutputFormat => ["png", "jpeg", "webp", "svg"].includes(value));
  const streamingEndpointCount = modelEndpoints?.endpoints.filter(
    (endpoint) => endpoint.supportsStreaming,
  ).length;

  if (mode === "video") {
    return <VideoWorkspacePanel onModeChange={() => setMode("image")} />;
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background text-foreground">
      <header className="border-b border-border/70 bg-fuchsia-500/[0.06] px-5 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-fuchsia-500">
              <ImageIcon className="size-4" aria-hidden="true" />
              ZImage
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Generate images</h1>
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

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8">
        <section className="border-b border-border/70 pb-7">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <label htmlFor="zimage-prompt" className="text-sm font-medium">
                Prompt
              </label>
              <Textarea
                id="zimage-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the image you want to create..."
                className="mt-2 min-h-32 resize-y bg-background/70"
                disabled={isGenerating}
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium" htmlFor="zimage-model">
                Model
              </label>
              <select
                id="zimage-model"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                disabled={isLoading || isGenerating}
              >
                {models.length === 0 ? <option value="">No image models available</option> : null}
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name ?? model.id}
                  </option>
                ))}
              </select>

              {modelEndpoints?.endpoints.length ? (
                <SelectField
                  label="Provider endpoint"
                  value={selectedEndpointIndex}
                  options={["", ...modelEndpoints.endpoints.map((_, index) => String(index))]}
                  onChange={(value) => {
                    setSelectedEndpointIndex(value);
                    setProviderOptionsJson("");
                    setUseStreaming(false);
                  }}
                  disabled={isGenerating || isLoadingEndpoints}
                  optionLabel={(value) => {
                    if (value === "") return "Automatic routing";
                    const endpoint = modelEndpoints.endpoints[Number(value)];
                    return (
                      endpoint?.providerName ??
                      endpoint?.providerTag ??
                      endpoint?.providerSlug ??
                      "Provider endpoint"
                    );
                  }}
                />
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label="Aspect ratio"
                  value={aspectRatio}
                  options={aspectRatios}
                  onChange={setAspectRatio}
                  disabled={!modelSupports(supportedParameters, "aspect_ratio") || isGenerating}
                />
                <SelectField
                  label="Count"
                  value={String(count)}
                  options={["1", "2", "3", "4"]}
                  onChange={(value) => setCount(Number(value))}
                  disabled={isGenerating}
                  optionLabel={(value) => `${value} image${value === "1" ? "" : "s"}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label="Quality"
                  value={quality}
                  options={qualityOptions}
                  onChange={(value) => setQuality(value as ImageQuality)}
                  disabled={!modelSupports(supportedParameters, "quality") || isGenerating}
                />
                <SelectField
                  label="Format"
                  value={outputFormat}
                  options={formatOptions}
                  onChange={(value) => setOutputFormat(value as ImageOutputFormat)}
                  disabled={!modelSupports(supportedParameters, "output_format") || isGenerating}
                />
              </div>

              {modelSupports(supportedParameters, "resolution") ? (
                <SelectField
                  label="Resolution"
                  value={resolution}
                  options={["", ...resolutions]}
                  onChange={setResolution}
                  disabled={isGenerating}
                  optionLabel={(value) => value || "Provider default"}
                />
              ) : null}
              {modelSupports(supportedParameters, "size") ? (
                <SelectField
                  label="Size"
                  value={size}
                  options={["", ...sizes]}
                  onChange={setSize}
                  disabled={isGenerating}
                  optionLabel={(value) => value || "Provider default"}
                />
              ) : null}
              {modelSupports(supportedParameters, "background") ? (
                <SelectField
                  label="Background"
                  value={background}
                  options={backgroundOptions}
                  onChange={(value) => setBackground(value as ImageBackground)}
                  disabled={isGenerating}
                />
              ) : null}
              {modelSupports(supportedParameters, "output_compression") ? (
                <label className="text-xs text-muted-foreground">
                  Compression: {outputCompression}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={outputCompression}
                    onChange={(event) => setOutputCompression(Number(event.target.value))}
                    className="mt-2 w-full accent-fuchsia-500"
                    disabled={isGenerating}
                  />
                </label>
              ) : null}
              {modelSupports(supportedParameters, "seed") ? (
                <label className="text-xs text-muted-foreground">
                  Seed
                  <input
                    inputMode="numeric"
                    value={seed}
                    onChange={(event) => setSeed(event.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Random"
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    disabled={isGenerating}
                  />
                </label>
              ) : null}
              {modelSupports(supportedParameters, "input_references") ? (
                <ReferenceImageDropzone
                  label="Reference images"
                  description="PNG, JPEG, WebP, or GIF · up to 8 MB each"
                  value={referenceImages}
                  onChange={setReferenceImages}
                  maxImages={maxReferenceImages}
                  disabled={isGenerating}
                />
              ) : null}
              {supportsStreaming ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={useStreaming}
                    onChange={(event) => setUseStreaming(event.target.checked)}
                    className="accent-fuchsia-500"
                    disabled={isGenerating}
                  />
                  Use the streaming response when supported
                </label>
              ) : null}
              {selectedEndpoint && selectedEndpoint.allowedPassthroughParameters.length > 0 ? (
                <label className="text-xs text-muted-foreground">
                  Provider options (JSON)
                  <textarea
                    value={providerOptionsJson}
                    onChange={(event) => setProviderOptionsJson(event.target.value)}
                    placeholder='{ "steps": 40 }'
                    className="mt-1 min-h-16 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
                    disabled={isGenerating}
                    aria-describedby="zimage-provider-options-help"
                  />
                  <span id="zimage-provider-options-help" className="mt-1 block text-[11px]">
                    Allowed keys: {selectedEndpoint.allowedPassthroughParameters.join(", ")}
                  </span>
                </label>
              ) : null}

              <p className="text-[11px] text-muted-foreground/75">
                {isLoadingEndpoints
                  ? "Checking provider endpoints..."
                  : modelEndpoints
                    ? `${modelEndpoints.endpoints.length} OpenRouter provider endpoint${modelEndpoints.endpoints.length === 1 ? "" : "s"}${streamingEndpointCount ? `, ${streamingEndpointCount} stream-capable` : ""}`
                    : "Provider endpoint details unavailable"}
              </p>
              <Button
                onClick={() => void generate()}
                disabled={isGenerating || isLoading || !modelId || prompt.trim().length === 0}
                className="mt-auto w-full gap-2"
              >
                {isGenerating ? (
                  <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <SparklesIcon className="size-4" aria-hidden="true" />
                )}
                {isGenerating ? "Generating..." : "Generate"}
              </Button>
            </div>
          </div>
          {error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <section>
          <p className="sr-only" role="status">
            {generationAnnouncement}
          </p>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Your generations</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Stored locally in the server database.
              </p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{generations.length}</span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
              Loading image workspace...
            </div>
          ) : generations.length === 0 && !isGenerating ? (
            <div className="flex flex-col items-center justify-center border-y border-border/60 py-16 text-center">
              <ImageIcon className="size-8 text-muted-foreground/50" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium">No generations yet</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Your generated images will appear here as soon as the first prompt completes.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {isGenerating ? <PendingGenerationCard count={count} prompt={prompt} /> : null}
              {visibleGenerations.map((generation) => (
                <GenerationCard
                  key={generation.id}
                  generation={generation}
                  loadImageContent={imageContentLoader.load}
                  onDelete={deleteGeneration}
                />
              ))}
            </div>
          )}
          {generations.length > visibleGenerationCount ? (
            <div ref={observeGenerationSentinel} className="flex justify-center py-5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setVisibleGenerationCount((current) => current + GENERATION_WINDOW_SIZE)
                }
              >
                Load more generations
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  optionLabel = defaultOptionLabel,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: ReadonlyArray<string>;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly optionLabel?: (value: string) => string;
}) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
