import {
  FilmIcon,
  ImageIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Effect from "effect/Effect";

import type {
  VideoGenerationInput,
  VideoGenerationModel,
  VideoGenerationRecord,
} from "@t3tools/contracts";

import { PrimaryEnvironmentHttpClient } from "../environments/primary/httpClient";
import { runPrimaryHttp } from "../lib/runtime";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ReferenceImageDropzone, type ReferenceImage } from "./ReferenceImageDropzone";

const DEFAULT_ASPECT_RATIOS = ["16:9", "9:16", "1:1"];
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "expired"]);

export function VideoWorkspacePanel({ onModeChange }: { readonly onModeChange: () => void }) {
  const [models, setModels] = useState<ReadonlyArray<VideoGenerationModel>>([]);
  const [generations, setGenerations] = useState<ReadonlyArray<VideoGenerationRecord>>([]);
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState("");
  const [resolution, setResolution] = useState("");
  const [aspectRatio, setAspectRatio] = useState("");
  const [size, setSize] = useState("");
  const [generateAudio, setGenerateAudio] = useState(true);
  const [seed, setSeed] = useState("");
  const [firstFrameImages, setFirstFrameImages] = useState<ReadonlyArray<ReferenceImage>>([]);
  const [lastFrameImages, setLastFrameImages] = useState<ReadonlyArray<ReferenceImage>>([]);
  const [referenceImages, setReferenceImages] = useState<ReadonlyArray<ReferenceImage>>([]);
  const [providerSlug, setProviderSlug] = useState("");
  const [providerOptionsJson, setProviderOptionsJson] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === modelId) ?? models[0] ?? null,
    [modelId, models],
  );
  const supportsFirstFrame = selectedModel?.supportedFrameImages.includes("first_frame") ?? false;
  const supportsLastFrame = selectedModel?.supportedFrameImages.includes("last_frame") ?? false;
  const aspectRatioOptions = selectedModel?.supportedAspectRatios.length
    ? selectedModel.supportedAspectRatios
    : DEFAULT_ASPECT_RATIOS;

  const loadGenerations = useCallback(async () => {
    const result = await runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) => client.videoGeneration.generations({ headers: {} })),
      ),
    );
    setGenerations(result.generations);
    return result.generations;
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [modelResult, generationResult] = await Promise.all([
        runPrimaryHttp(
          PrimaryEnvironmentHttpClient.pipe(
            Effect.flatMap((client) => client.videoGeneration.models({ headers: {} })),
          ),
        ),
        loadGenerations(),
      ]);
      setModels(modelResult.models);
      setModelId((current) => current || modelResult.models[0]?.id || "");
      setGenerations(generationResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the video workspace.");
    } finally {
      setIsLoading(false);
    }
  }, [loadGenerations]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedModel) return;
    setDuration(String(selectedModel.supportedDurations[0] ?? ""));
    setResolution(selectedModel.supportedResolutions[0] || "");
    setAspectRatio(aspectRatioOptions[0] || "");
    setSize(selectedModel.supportedSizes[0] || "");
    setGenerateAudio(selectedModel.generateAudio);
  }, [aspectRatioOptions, selectedModel]);

  useEffect(() => {
    if (!generations.some((generation) => !TERMINAL_STATUSES.has(generation.status))) return;
    const timer = window.setInterval(() => {
      void loadGenerations().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [generations, loadGenerations]);

  const generate = async () => {
    if (!modelId) {
      setError("Choose a video model.");
      return;
    }
    const references = referenceImages.map((image) => ({
      type: "image_url" as const,
      url: image.dataUrl,
    }));
    const frameImages = [
      ...(firstFrameImages[0]
        ? [{ url: firstFrameImages[0].dataUrl, frameType: "first_frame" as const }]
        : []),
      ...(lastFrameImages[0]
        ? [{ url: lastFrameImages[0].dataUrl, frameType: "last_frame" as const }]
        : []),
    ];
    if (!prompt.trim() && frameImages.length === 0 && references.length === 0) {
      setError("Enter a prompt or attach a frame/reference image.");
      return;
    }

    let provider: Record<string, unknown> | undefined;
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
      const unsupportedKeys = Object.keys(options).filter(
        (key) => !selectedModel?.allowedPassthroughParameters.includes(key),
      );
      if (unsupportedKeys.length > 0) {
        setError(`Unsupported provider option: ${unsupportedKeys.join(", ")}.`);
        return;
      }
      if (!providerSlug.trim()) {
        setError("Enter the provider slug for provider options.");
        return;
      }
      provider = {
        options: {
          [providerSlug.trim()]: { parameters: options },
        },
      };
    }

    const input: VideoGenerationInput = {
      model: modelId,
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
      ...(duration ? { duration: Number(duration) } : {}),
      ...(resolution ? { resolution } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(size ? { size } : {}),
      ...(selectedModel?.generateAudio ? { generateAudio } : {}),
      ...(seed.trim() ? { seed: Number(seed) } : {}),
      ...(frameImages.length > 0 ? { frameImages } : {}),
      ...(references.length > 0 ? { inputReferences: references } : {}),
      ...(provider ? { provider } : {}),
      ...(callbackUrl.trim() ? { callbackUrl: callbackUrl.trim() } : {}),
    };

    setIsGenerating(true);
    setError(null);
    try {
      const result = await runPrimaryHttp(
        PrimaryEnvironmentHttpClient.pipe(
          Effect.flatMap((client) =>
            client.videoGeneration.generate({ payload: input, headers: {} }),
          ),
        ),
      );
      setGenerations((current) => [result, ...current]);
      setPrompt("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Video generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteGeneration = async (id: string) => {
    try {
      await runPrimaryHttp(
        PrimaryEnvironmentHttpClient.pipe(
          Effect.flatMap((client) =>
            client.videoGeneration.deleteGeneration({ params: { id }, headers: {} }),
          ),
        ),
      );
      setGenerations((current) => current.filter((generation) => generation.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the generation.");
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background text-foreground">
      <header className="border-b border-border/70 bg-fuchsia-500/[0.06] px-5 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-fuchsia-500">
              <FilmIcon className="size-4" aria-hidden="true" />
              ZImage
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Generate video</h1>
          </div>
          <div className="flex items-center gap-1 border border-border/70 bg-background/70 p-1">
            <Button variant="ghost" size="sm" onClick={onModeChange} className="gap-2">
              <ImageIcon className="size-3.5" aria-hidden="true" /> Images
            </Button>
            <Button size="sm" className="gap-2">
              <FilmIcon className="size-3.5" aria-hidden="true" /> Video
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void load()}
              aria-label="Refresh video workspace"
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
              <label htmlFor="zimage-video-prompt" className="text-sm font-medium">
                Prompt <span className="text-muted-foreground">(optional with references)</span>
              </label>
              <Textarea
                id="zimage-video-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the motion, camera, and action..."
                className="mt-2 min-h-32 resize-y bg-background/70"
                disabled={isGenerating}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {supportsFirstFrame ? (
                  <ReferenceImageDropzone
                    label="First frame"
                    description="Exact opening frame · one image"
                    value={firstFrameImages}
                    onChange={setFirstFrameImages}
                    multiple={false}
                    disabled={isGenerating}
                  />
                ) : null}
                {supportsLastFrame ? (
                  <ReferenceImageDropzone
                    label="Last frame"
                    description="Exact closing frame · one image"
                    value={lastFrameImages}
                    onChange={setLastFrameImages}
                    multiple={false}
                    disabled={isGenerating}
                  />
                ) : null}
              </div>
              <div className="mt-4">
                <ReferenceImageDropzone
                  label="Reference images"
                  description="Guide subject, identity, or style · up to 4 images"
                  value={referenceImages}
                  onChange={setReferenceImages}
                  disabled={isGenerating}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <SelectField
                label="Model"
                value={modelId}
                options={models.map((model) => model.id)}
                onChange={setModelId}
                disabled={isLoading || isGenerating}
                optionLabel={(value) => models.find((model) => model.id === value)?.name ?? value}
              />
              {selectedModel?.supportedDurations.length ? (
                <SelectField
                  label="Duration"
                  value={duration}
                  options={selectedModel.supportedDurations.map(String)}
                  onChange={setDuration}
                  disabled={isGenerating}
                  optionLabel={(value) => `${value} seconds`}
                />
              ) : null}
              {selectedModel?.supportedResolutions.length ? (
                <SelectField
                  label="Resolution"
                  value={resolution}
                  options={selectedModel.supportedResolutions}
                  onChange={setResolution}
                  disabled={isGenerating}
                />
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {selectedModel?.supportedAspectRatios.length || aspectRatio ? (
                  <SelectField
                    label="Aspect ratio"
                    value={aspectRatio}
                    options={aspectRatioOptions}
                    onChange={setAspectRatio}
                    disabled={isGenerating}
                  />
                ) : null}
                {selectedModel?.supportedSizes.length ? (
                  <SelectField
                    label="Size"
                    value={size}
                    options={selectedModel.supportedSizes}
                    onChange={setSize}
                    disabled={isGenerating}
                  />
                ) : null}
              </div>
              {selectedModel?.generateAudio ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={generateAudio}
                    onChange={(event) => setGenerateAudio(event.target.checked)}
                    className="accent-fuchsia-500"
                    disabled={isGenerating}
                  />
                  Generate audio when supported
                </label>
              ) : null}
              {selectedModel?.supportsSeed ? (
                <UrlField
                  label="Seed"
                  value={seed}
                  onChange={(value) => setSeed(value.replace(/[^0-9]/g, ""))}
                  placeholder="Random"
                  disabled={isGenerating}
                />
              ) : null}
              {selectedModel?.allowedPassthroughParameters.length ? (
                <label className="text-xs text-muted-foreground">
                  Provider options
                  <input
                    value={providerSlug}
                    onChange={(event) => setProviderSlug(event.target.value)}
                    placeholder="Provider slug, e.g. google-vertex"
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    disabled={isGenerating}
                  />
                  <textarea
                    value={providerOptionsJson}
                    onChange={(event) => setProviderOptionsJson(event.target.value)}
                    placeholder='{ "enhancePrompt": true }'
                    className="mt-1 min-h-16 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
                    disabled={isGenerating}
                  />
                  <span className="mt-1 block text-[11px]">
                    Allowed keys: {selectedModel.allowedPassthroughParameters.join(", ")}
                  </span>
                </label>
              ) : null}
              <UrlField
                label="Callback URL (optional HTTPS webhook)"
                value={callbackUrl}
                onChange={setCallbackUrl}
                placeholder="https://your-app.example/webhooks/openrouter"
                disabled={isGenerating}
              />
              <Button
                onClick={() => void generate()}
                disabled={isGenerating || isLoading || !modelId}
                className="mt-auto w-full gap-2"
              >
                {isGenerating ? (
                  <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <SparklesIcon className="size-4" aria-hidden="true" />
                )}
                {isGenerating ? "Submitting..." : "Generate video"}
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
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Your videos</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Jobs stay in the workspace while OpenRouter renders them.
              </p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{generations.length}</span>
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
              Loading video workspace...
            </div>
          ) : generations.length === 0 ? (
            <div className="flex flex-col items-center justify-center border-y border-border/60 py-16 text-center">
              <FilmIcon className="size-8 text-muted-foreground/50" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium">No videos yet</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Text-to-video, image-to-video, and reference-guided results will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {generations.map((generation) => (
                <div
                  key={generation.id}
                  className="group min-w-0 border border-border/70 bg-card/30"
                >
                  {generation.assets[0] ? (
                    <video
                      src={generation.assets[0].url}
                      controls
                      preload="metadata"
                      className="aspect-video w-full bg-muted/35 object-contain"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-muted/35">
                      {TERMINAL_STATUSES.has(generation.status) ? (
                        <p className="px-4 text-center text-xs text-destructive">
                          {generation.error ?? `Generation ${generation.status}.`}
                        </p>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
                          {generation.status === "pending" ? "Queued" : "Rendering"}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 border-t border-border/60 p-2.5">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        {generation.status} · {generation.model}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {generation.prompt ?? "Reference-guided video"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => void deleteGeneration(generation.id)}
                      aria-label="Delete video generation"
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2Icon className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function UrlField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly disabled: boolean;
}) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        disabled={disabled}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  optionLabel = (option) => option,
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
        className={cn(
          "mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs",
          options.length === 0 && "text-muted-foreground",
        )}
        disabled={disabled || options.length === 0}
      >
        {options.length === 0 ? <option value="">Unavailable</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
