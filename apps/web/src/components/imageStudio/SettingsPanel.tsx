import {
  DicesIcon,
  ImageIcon,
  RefreshCwIcon,
  Settings2Icon,
} from "lucide-react";

import {
  type ImageGenerationModel,
  type ImageGenerationModelEndpoints,
} from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ReferenceImageDropzone, type ReferenceImage } from "../ReferenceImageDropzone";

type ImageOutputFormat = "png" | "jpeg" | "webp" | "svg";
type ImageQuality = "auto" | "low" | "medium" | "high";
type ImageBackground = "auto" | "transparent" | "opaque";

function RatioChip({
  value,
  selected,
  onClick,
  disabled,
}: {
  readonly value: string;
  readonly selected: boolean;
  readonly onClick: () => void;
  readonly disabled: boolean;
}) {
  const isAuto = value === "auto";
  const [widthPart, heightPart] = value.split(":");
  const widthRatio = isAuto ? 1 : Number.parseFloat(widthPart ?? "");
  const heightRatio = isAuto ? 1 : Number.parseFloat(heightPart ?? "");
  const safeWidth = Number.isFinite(widthRatio) && widthRatio > 0 ? widthRatio : 1;
  const safeHeight = Number.isFinite(heightRatio) && heightRatio > 0 ? heightRatio : 1;
  const boxWidth = 34;
  const boxHeight = 26;
  const scale = Math.min(boxWidth / safeWidth, boxHeight / safeHeight);
  const previewWidth = Math.max(8, Math.round(safeWidth * scale));
  const previewHeight = Math.max(8, Math.round(safeHeight * scale));

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-fuchsia-500/70 bg-fuchsia-500/[0.08] text-foreground"
          : "border-border/80 bg-background/50 text-muted-foreground hover:border-fuchsia-500/50 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "block rounded-[3px] border",
          selected ? "border-fuchsia-400 bg-fuchsia-500/25" : "border-border bg-muted",
          isAuto && "border-dashed",
        )}
        style={{ width: previewWidth, height: previewHeight }}
      />
      <span className="text-[10px] font-medium tabular-nums">{value}</span>
    </button>
  );
}

function ChipGroup<T extends string>({
  label,
  value,
  values,
  onChange,
  disabled,
  renderValue = (candidate: T) => candidate,
}: {
  readonly label: string;
  readonly value: T;
  readonly values: ReadonlyArray<T>;
  readonly onChange: (value: T) => void;
  readonly disabled: boolean;
  readonly renderValue?: (value: T) => string;
}) {
  if (values.length === 0) return null;
  return (
    <div className="text-xs text-muted-foreground">
      <span>{label}</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {values.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={candidate === value}
            onClick={() => onChange(candidate)}
            disabled={disabled}
            className={cn(
              "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium capitalize transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              candidate === value
                ? "border-fuchsia-500/70 bg-fuchsia-500/[0.1] text-foreground"
                : "border-border/80 bg-background/50 text-muted-foreground hover:border-fuchsia-500/50 hover:text-foreground",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {renderValue(candidate)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  optionLabel = (candidate: string) => candidate,
  includeEmpty,
  emptyLabel = "Provider default",
}: {
  readonly label: string;
  readonly value: string;
  readonly options: ReadonlyArray<string>;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
  readonly optionLabel?: (value: string) => string;
  readonly includeEmpty?: boolean;
  readonly emptyLabel?: string;
}) {
  const selectable = includeEmpty ? ["", ...options] : options;
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        disabled={disabled}
      >
        {selectable.map((option) => (
          <option key={option} value={option}>
            {option === "" ? emptyLabel : optionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function supports(
  supportedParameters: ImageGenerationModel["supportedParameters"],
  parameter: string,
): boolean {
  return supportedParameters[parameter] !== undefined;
}

function enumValues(
  supportedParameters: ImageGenerationModel["supportedParameters"],
  parameter: string,
  fallback: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const descriptor = supportedParameters[parameter];
  return descriptor?.type === "enum" && descriptor.values.length > 0 ? descriptor.values : fallback;
}

export function SettingsPanel(props: {
  readonly models: ReadonlyArray<ImageGenerationModel>;
  readonly modelId: string;
  readonly onModelChange: (modelId: string) => void;
  readonly modelEndpoints: ImageGenerationModelEndpoints | null;
  readonly selectedEndpointIndex: string;
  readonly onEndpointChange: (index: string) => void;
  readonly isLoadingEndpoints: boolean;
  readonly isGptImage2Model: boolean;
  readonly supportedParameters: ImageGenerationModel["supportedParameters"];
  readonly aspectRatio: string;
  readonly onAspectRatioChange: (value: string) => void;
  readonly resolution: string;
  readonly onResolutionChange: (value: string) => void;
  readonly size: string;
  readonly onSizeChange: (value: string) => void;
  readonly quality: ImageQuality;
  readonly onQualityChange: (value: ImageQuality) => void;
  readonly outputFormat: ImageOutputFormat;
  readonly onOutputFormatChange: (value: ImageOutputFormat) => void;
  readonly background: ImageBackground;
  readonly onBackgroundChange: (value: ImageBackground) => void;
  readonly count: number;
  readonly onCountChange: (value: number) => void;
  readonly countOptions: ReadonlyArray<number>;
  readonly seed: string;
  readonly onSeedChange: (value: string) => void;
  readonly onRandomizeSeed: () => void;
  readonly outputCompression: number;
  readonly onOutputCompressionChange: (value: number) => void;
  readonly useStreaming: boolean;
  readonly onUseStreamingChange: (value: boolean) => void;
  readonly supportsStreaming: boolean;
  readonly referenceImages: ReadonlyArray<ReferenceImage>;
  readonly onReferenceImagesChange: (images: ReadonlyArray<ReferenceImage>) => void;
  readonly minReferenceImages: number;
  readonly maxReferenceImages: number;
  readonly selectedEndpoint: ImageGenerationModelEndpoints["endpoints"][number] | null;
  readonly providerOptionsJson: string;
  readonly onProviderOptionsChange: (value: string) => void;
  readonly disabled: boolean;
}) {
  const {
    models,
    modelId,
    onModelChange,
    modelEndpoints,
    selectedEndpointIndex,
    onEndpointChange,
    isLoadingEndpoints,
    isGptImage2Model,
    supportedParameters,
    aspectRatio,
    onAspectRatioChange,
    resolution,
    onResolutionChange,
    size,
    onSizeChange,
    quality,
    onQualityChange,
    outputFormat,
    onOutputFormatChange,
    background,
    onBackgroundChange,
    count,
    onCountChange,
    countOptions,
    seed,
    onSeedChange,
    onRandomizeSeed,
    outputCompression,
    onOutputCompressionChange,
    useStreaming,
    onUseStreamingChange,
    supportsStreaming,
    referenceImages,
    onReferenceImagesChange,
    minReferenceImages,
    maxReferenceImages,
    selectedEndpoint,
    providerOptionsJson,
    onProviderOptionsChange,
    disabled,
  } = props;

  const aspectRatios = enumValues(supportedParameters, "aspect_ratio", [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
  ]);
  const resolutions = enumValues(supportedParameters, "resolution", ["512", "1K", "2K", "4K"]);
  const sizes = enumValues(supportedParameters, "size", [
    "1024x1024",
    "1536x1024",
    "1024x1536",
  ]);
  const qualityOptions = enumValues(supportedParameters, "quality", [
    "auto",
    "low",
    "medium",
    "high",
  ]).filter((value): value is ImageQuality =>
    (["auto", "low", "medium", "high"] as const).includes(value as ImageQuality),
  );
  const formatOptions = enumValues(supportedParameters, "output_format", [
    "png",
    "jpeg",
    "webp",
    "svg",
  ]).filter((value): value is ImageOutputFormat =>
    (["png", "jpeg", "webp", "svg"] as const).includes(value as ImageOutputFormat),
  );
  const backgroundOptions = enumValues(supportedParameters, "background", [
    "auto",
    "transparent",
    "opaque",
  ]).filter((value): value is ImageBackground =>
    (["auto", "transparent", "opaque"] as const).includes(value as ImageBackground),
  );
  const streamingEndpointCount = modelEndpoints?.endpoints.filter(
    (endpoint) => endpoint.supportsStreaming,
  ).length;

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border/70 bg-card/40 p-4 shadow-sm/5">
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <Settings2Icon className="size-4 text-fuchsia-500" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Settings</h2>
      </div>

      <label className="text-xs text-muted-foreground">
        Model
        <select
          value={modelId}
          onChange={(event) => onModelChange(event.target.value)}
          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          disabled={disabled}
        >
          {models.length === 0 ? <option value="">No image models available</option> : null}
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name ?? model.id}
            </option>
          ))}
        </select>
      </label>

      {isGptImage2Model ? (
        <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Provider endpoint: OpenAI via OpenRouter (fixed)
        </p>
      ) : modelEndpoints && modelEndpoints.endpoints.length > 0 ? (
        <SelectField
          label="Provider endpoint"
          value={selectedEndpointIndex}
          options={modelEndpoints.endpoints.map((_, index) => String(index))}
          onChange={onEndpointChange}
          disabled={disabled || isLoadingEndpoints}
          includeEmpty
          emptyLabel="Automatic routing"
          optionLabel={(value) => {
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

      {supports(supportedParameters, "aspect_ratio") ? (
        <div className="text-xs text-muted-foreground">
          <span>Aspect ratio</span>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {aspectRatios.map((value) => (
              <RatioChip
                key={value}
                value={value}
                selected={value === aspectRatio}
                onClick={() => onAspectRatioChange(value)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ) : null}

      {supports(supportedParameters, "n") ? (
        <ChipGroup
          label="Images per prompt"
          value={String(count)}
          values={countOptions.map(String)}
          onChange={(value) => onCountChange(Number(value))}
          disabled={disabled}
          renderValue={(value) => `${value} image${value === "1" ? "" : "s"}`}
        />
      ) : null}

      {qualityOptions.length > 0 ? (
        <ChipGroup
          label="Quality"
          value={quality}
          values={qualityOptions}
          onChange={onQualityChange}
          disabled={disabled}
        />
      ) : null}

      {formatOptions.length > 0 ? (
        <ChipGroup
          label="Format"
          value={outputFormat}
          values={formatOptions}
          onChange={onOutputFormatChange}
          disabled={disabled}
        />
      ) : null}

      {backgroundOptions.length > 0 ? (
        <ChipGroup
          label="Background"
          value={background}
          values={backgroundOptions}
          onChange={onBackgroundChange}
          disabled={disabled}
        />
      ) : null}

      {supports(supportedParameters, "resolution") ? (
        <SelectField
          label="Resolution"
          value={resolution}
          options={resolutions}
          onChange={onResolutionChange}
          disabled={disabled}
          includeEmpty
        />
      ) : null}

      {supports(supportedParameters, "size") ? (
        <SelectField
          label="Size"
          value={size}
          options={sizes}
          onChange={onSizeChange}
          disabled={disabled}
          includeEmpty
        />
      ) : null}

      {supports(supportedParameters, "seed") ? (
        <label className="text-xs text-muted-foreground">
          Seed
          <span className="mt-1 flex gap-1.5">
            <input
              inputMode="numeric"
              value={seed}
              onChange={(event) => onSeedChange(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Random"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              disabled={disabled}
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Randomize seed"
              title="Randomize seed"
              className="h-8 shrink-0 text-muted-foreground"
              onClick={onRandomizeSeed}
              disabled={disabled}
            >
              <DicesIcon className="size-3.5" aria-hidden="true" />
            </Button>
          </span>
        </label>
      ) : null}

      {supports(supportedParameters, "output_compression") ? (
        <label className="text-xs text-muted-foreground">
          Compression: {outputCompression}%
          <input
            type="range"
            min={0}
            max={100}
            value={outputCompression}
            onChange={(event) => onOutputCompressionChange(Number(event.target.value))}
            className="mt-2 w-full accent-fuchsia-500"
            disabled={disabled}
          />
        </label>
      ) : null}

      {supportsStreaming ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={useStreaming}
            onChange={(event) => onUseStreamingChange(event.target.checked)}
            className="accent-fuchsia-500"
            disabled={disabled}
          />
          Use the streaming response when supported
        </label>
      ) : null}

      {supports(supportedParameters, "input_references") ? (
        <ReferenceImageDropzone
          label="Reference images"
          description={
            "PNG, JPEG, WebP, or GIF · up to 8 MB each" +
            (minReferenceImages > 0 ? ` · at least ${minReferenceImages} required` : "")
          }
          value={referenceImages}
          onChange={onReferenceImagesChange}
          maxImages={maxReferenceImages}
          disabled={disabled}
        />
      ) : null}

      {selectedEndpoint && selectedEndpoint.allowedPassthroughParameters.length > 0 ? (
        <label className="text-xs text-muted-foreground">
          Provider options (JSON)
          <textarea
            value={providerOptionsJson}
            onChange={(event) => onProviderOptionsChange(event.target.value)}
            placeholder='{ "steps": 40 }'
            className="mt-1 min-h-16 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
            disabled={disabled}
            aria-describedby="zimage-provider-options-help"
          />
          <span id="zimage-provider-options-help" className="mt-1 block text-[11px]">
            Allowed keys: {selectedEndpoint.allowedPassthroughParameters.join(", ")}
          </span>
        </label>
      ) : null}

      <div className="flex items-center gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground/75">
        <ImageIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {isLoadingEndpoints
            ? "Checking provider endpoints..."
            : modelEndpoints
              ? modelEndpoints.endpoints.length === 0
                ? "Provider endpoint details unavailable; using model defaults"
                : `${modelEndpoints.endpoints.length} OpenRouter provider endpoint${
                    modelEndpoints.endpoints.length === 1 ? "" : "s"
                  }${streamingEndpointCount ? `, ${streamingEndpointCount} stream-capable` : ""}`
              : "Provider endpoint details unavailable"}
        </span>
        {modelEndpoints ? (
          <RefreshCwIcon
            className={cn("ml-auto size-3.5", isLoadingEndpoints && "animate-spin")}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </section>
  );
}
