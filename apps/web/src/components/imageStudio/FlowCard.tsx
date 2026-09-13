import { inputPortDrop, outputPortDrag } from "./flowPortDrag";
import { memo, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ProviderInstanceId,
  type ImageGenerationInput,
  type ImageGenerationModel,
  type ImageGenerationRecord,
  type VideoGenerationInput,
  type VideoGenerationModel,
  type VideoGenerationRecord,
} from "@t3tools/contracts";
import {
  DEFAULT_IMAGE_DIRECTION,
  prepareImagePrompt,
} from "@t3tools/shared/imageCreativeDirection";
import { loadPrimaryVideoAsset } from "../../environments/primary/videoAssetLoader";
import { countOptionsFor } from "../../lib/imageModelCapabilities";
import { LazyGeneratedImageTile } from "../ImageGenerationGallery";
import type { LoadImageContent } from "../imageContentLoader";
import { CreativeDirectionPanel } from "./CreativeDirectionPanel";
import { CivitaiAdvancedSettings } from "./CivitaiAdvancedSettings";
import { PORT_Y, type FlowNode, type FlowEdge } from "./flowModel";

const terminalRecord = (status: VideoGenerationRecord["status"]) =>
  ["completed", "failed", "cancelled", "expired"].includes(status);

export type ImageCatalog = { readonly provider: string; readonly model: ImageGenerationModel };
export type FlowStatus = {
  readonly state: "running" | "queued" | "error" | "done";
  readonly message: string;
};
export const imageModelKey = (provider: string, id: string) => `${provider}:${id}`;

export function initialImageInput(entry: ImageCatalog): ImageGenerationInput {
  return {
    model: entry.model.id,
    prompt: "Canvas prompt",
    ...(entry.provider === "civitai"
      ? { providerInstanceId: ProviderInstanceId.make("civitai") }
      : {}),
    creativeDirection: { ...DEFAULT_IMAGE_DIRECTION, detail: "crisp" },
  };
}

function SelectField({
  label,
  value,
  values,
  onChange,
  empty = "Auto",
}: {
  readonly label: string;
  readonly value: string | number | undefined;
  readonly values: readonly (string | number)[];
  readonly onChange: (value: string) => void;
  readonly empty?: string;
}) {
  return (
    <label className="zf-field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{empty}</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

const VideoPreview = memo(function VideoPreview({
  asset,
}: {
  readonly asset: VideoGenerationRecord["assets"][number];
}) {
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!requested) return;
    let active = true;
    let url = "";
    void loadPrimaryVideoAsset(asset.url)
      .then((result) => {
        if (!active) {
          URL.revokeObjectURL(result);
          return;
        }
        url = result;
        setSource(result);
      })
      .catch(() => {
        if (active) {
          setError("Preview failed. Click to retry.");
          setRequested(false);
        }
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset.url, requested]);
  return source ? (
    <div className="zf-video">
      <video controls preload="metadata" src={source} />
      <a
        href={source}
        download={`zimage-${asset.id}.${asset.mediaType.includes("webm") ? "webm" : asset.mediaType.includes("quicktime") ? "mov" : "mp4"}`}
      >
        Download video
      </a>
    </div>
  ) : (
    <button
      type="button"
      className="zf-preview-action"
      disabled={requested}
      onClick={() => {
        setError("");
        setRequested(true);
      }}
    >
      {error || (requested ? "Loading video…" : "Load video preview")}
    </button>
  );
});

export const FlowCard = memo(function FlowCard({
  node,
  selected,
  disabled,
  catalogs,
  videoModels,
  images,
  videos,
  status,
  connected,
  pendingConnection,
  loadImage,
  onChange,
  onDrag,
  onSelect,
  onPort,
  onRun,
  onDuplicate,
  onRemove,
}: {
  readonly node: FlowNode;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly catalogs: readonly ImageCatalog[];
  readonly videoModels: readonly VideoGenerationModel[];
  readonly images: readonly ImageGenerationRecord[];
  readonly videos: readonly VideoGenerationRecord[];
  readonly status: FlowStatus | undefined;
  readonly connected: string;
  readonly pendingConnection: boolean;
  readonly loadImage: LoadImageContent;
  readonly onChange: (id: string, update: Partial<FlowNode>) => void;
  readonly onDrag: (event: ReactPointerEvent, node: FlowNode) => void;
  readonly onSelect: (id: string) => void;
  readonly onPort: (id: string, port: FlowEdge["port"] | "output", source?: string) => void;
  readonly onRun: (id: string) => void;
  readonly onDuplicate: (id: string) => void;
  readonly onRemove: (id: string) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const entry = catalogs.find(
    (item) =>
      item.provider === (node.image?.providerInstanceId ?? "openrouter") &&
      item.model.id === node.image?.model,
  );
  const videoModel = videoModels.find((item) => item.id === node.video?.model);
  const imageAssets = images
    .filter((record) => node.generationIds.includes(record.id))
    .flatMap((record) => record.assets);
  const videoRecords = node.generationIds.flatMap(
    (id) => videos.find((record) => record.id === id) ?? [],
  );
  const videoAssets = videoRecords.flatMap((record) => record.assets);
  const assetCount = node.kind === "image" ? imageAssets.length : videoAssets.length;
  const imageAsset = imageAssets[node.assetIndex];
  const videoAsset = videoAssets[node.assetIndex];
  const updateImage = (patch: Partial<ImageGenerationInput>) => {
    if (node.image) onChange(node.id, { image: { ...node.image, ...patch } });
  };
  const updateVideo = (patch: Partial<VideoGenerationInput>) => {
    if (node.video) onChange(node.id, { video: { ...node.video, ...patch } });
  };
  const clearImage = (key: keyof ImageGenerationInput) => {
    if (node.image) {
      const input = { ...node.image };
      delete input[key];
      onChange(node.id, { image: input });
    }
  };
  const clearVideo = (key: keyof VideoGenerationInput) => {
    if (node.video) {
      const input = { ...node.video };
      delete input[key];
      onChange(node.id, { video: input });
    }
  };
  const enums = (key: string) => {
    const descriptor = entry?.model.supportedParameters[key];
    return descriptor?.type === "enum" ? descriptor.values : [];
  };
  const port = (name: FlowEdge["port"]) => {
    const unavailable =
      name === "reference"
        ? !!entry && !entry.model.supportedParameters.input_references
        : name === "first_frame" || name === "last_frame"
          ? !!videoModel && !videoModel.supportedFrameImages.includes(name)
          : false;
    return (
      <button
        type="button"
        {...inputPortDrop(node.id, name, disabled || unavailable, onPort)}
        disabled={disabled || unavailable}
        className={`zf-port zf-input-port ${pendingConnection && !unavailable ? "zf-port-ready" : ""}`}
        style={{ top: PORT_Y[name] }}
        aria-label={`Connect to ${node.title}: ${name.replaceAll("_", " ")}`}
        data-label={name.replaceAll("_", " ")}
        title={
          unavailable
            ? `${name.replaceAll("_", " ")} is not supported by this model`
            : name.replaceAll("_", " ")
        }
        onClick={() => onPort(node.id, name)}
      />
    );
  };
  return (
    <article
      data-node-id={node.id}
      tabIndex={0}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onSelect(node.id);
      }}
      className={`zf-card zf-${node.kind} ${selected ? "zf-selected" : ""}`}
      style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)` }}
      onPointerDown={() => onSelect(node.id)}
      aria-label={`${node.title} card`}
    >
      <header
        className="zf-card-header"
        onPointerDown={(event) => {
          if (!(event.target instanceof HTMLElement && event.target.closest("button,input")))
            onDrag(event, node);
        }}
      >
        <span className="zf-kind" aria-hidden="true">
          {node.kind === "text" ? "T" : node.kind === "image" ? "▧" : "▸"}
        </span>
        <input
          aria-label="Card name"
          value={node.title}
          maxLength={80}
          disabled={disabled}
          onChange={(event) => onChange(node.id, { title: event.target.value })}
        />
        <button
          type="button"
          className="zf-card-menu"
          title="Duplicate card"
          aria-label={`Duplicate ${node.title}`}
          disabled={disabled}
          onClick={() => onDuplicate(node.id)}
        >
          ⧉
        </button>
        <button
          type="button"
          className="zf-card-menu"
          title="Remove card"
          aria-label={`Remove ${node.title}`}
          disabled={disabled}
          onClick={() => onRemove(node.id)}
        >
          ×
        </button>
        <button
          type="button"
          className="zf-card-menu"
          disabled={disabled}
          aria-label={node.collapsed ? "Expand card" : "Collapse card"}
          onClick={() => onChange(node.id, { collapsed: !node.collapsed })}
        >
          {node.collapsed ? "+" : "−"}
        </button>
      </header>
      {node.kind !== "video" && (
        <button
          type="button"
          className="zf-port zf-output-port"
          style={{ top: 67 }}
          disabled={disabled}
          {...outputPortDrag(node.id, disabled)}
          aria-label={`Connect from ${node.title}`}
          data-label={node.kind === "text" ? "prompt output" : "image output"}
          title={node.kind === "text" ? "Prompt output" : "Selected image output"}
          onClick={() => onPort(node.id, "output")}
        />
      )}
      {node.kind !== "text" && !node.libraryAsset && (
        <>
          {port("prompt")}
          {node.kind === "image" ? (
            port("reference")
          ) : (
            <>
              {port("first_frame")}
              {port("last_frame")}
            </>
          )}
        </>
      )}
      <div hidden={node.collapsed}>
        {node.kind === "text" ? (
          <div className="zf-prompt-body">
            <textarea
              aria-label="Prompt"
              placeholder="Describe your scene. Include the subject, setting, lighting, and details that matter."
              disabled={disabled}
              value={node.text}
              onChange={(event) => onChange(node.id, { text: event.target.value })}
            />
            <div className="zf-meta">
              {node.text.length.toLocaleString()} characters <span>Text output →</span>
            </div>
          </div>
        ) : (
          <>
            <div className="zf-output">
              {imageAsset ? (
                <LazyGeneratedImageTile
                  assetId={imageAsset.id}
                  alt={connected || node.title}
                  loadImageContent={loadImage}
                />
              ) : videoAsset ? (
                <VideoPreview key={videoAsset.id} asset={videoAsset} />
              ) : (
                <div className="zf-empty-output">
                  <span aria-hidden="true">{node.kind === "image" ? "▧" : "▸"}</span>
                  <strong>
                    {status?.state === "running"
                      ? "Generating…"
                      : videoRecords.some(
                            (record) =>
                              record.status === "pending" || record.status === "in_progress",
                          )
                        ? "Video is processing"
                        : node.generationIds.length
                          ? "Output unavailable"
                          : `${node.kind === "image" ? "Image" : "Video"} output`}
                  </strong>
                  <small>
                    {node.libraryAsset
                      ? "This asset may have been removed from the library."
                      : "Connect a prompt, then generate."}
                  </small>
                </div>
              )}
            </div>
            {assetCount > 1 && (
              <div className="zf-output-tabs" aria-label="Select output used by connections">
                {Array.from({ length: assetCount }, (_, index) => (
                  <button
                    type="button"
                    key={index}
                    disabled={disabled}
                    aria-pressed={node.assetIndex === index}
                    onClick={() => onChange(node.id, { assetIndex: index })}
                  >
                    {index + 1}
                  </button>
                ))}
                <span>Output to connections</span>
              </div>
            )}
            {!node.libraryAsset && (
              <fieldset disabled={disabled} className="zf-settings">
                <label className="zf-field">
                  <span>Model</span>
                  <select
                    aria-label={`${node.kind} model`}
                    value={
                      node.kind === "image"
                        ? node.image
                          ? imageModelKey(
                              node.image.providerInstanceId ?? "openrouter",
                              node.image.model,
                            )
                          : ""
                        : (node.video?.model ?? "")
                    }
                    onChange={(event) => {
                      if (node.kind === "image") {
                        const selectedEntry = catalogs.find(
                          (item) =>
                            imageModelKey(item.provider, item.model.id) === event.target.value,
                        );
                        if (selectedEntry)
                          onChange(node.id, {
                            image: {
                              ...initialImageInput(selectedEntry),
                              ...(node.image?.creativeDirection
                                ? { creativeDirection: node.image.creativeDirection }
                                : {}),
                            },
                          });
                      } else {
                        const model = videoModels.find((item) => item.id === event.target.value);
                        if (model)
                          onChange(node.id, {
                            video: { model: model.id, prompt: "Canvas prompt" },
                          });
                      }
                    }}
                  >
                    <option value="" disabled>
                      Choose a model
                    </option>
                    {node.kind === "image"
                      ? catalogs.map((item) => (
                          <option
                            key={imageModelKey(item.provider, item.model.id)}
                            value={imageModelKey(item.provider, item.model.id)}
                          >
                            {item.model.name ?? item.model.id} ·{" "}
                            {item.provider === "civitai" ? "Civitai" : "OpenRouter"}
                          </option>
                        ))
                      : videoModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name ?? model.id}
                          </option>
                        ))}
                  </select>
                </label>
                {node.kind === "image" && entry && (
                  <div className="zf-field-grid">
                    {enums("aspect_ratio").length > 0 && (
                      <SelectField
                        label="Aspect ratio"
                        value={node.image?.aspectRatio}
                        values={enums("aspect_ratio")}
                        onChange={(value) =>
                          value ? updateImage({ aspectRatio: value }) : clearImage("aspectRatio")
                        }
                      />
                    )}
                    <label className="zf-field">
                      <span>Images</span>
                      <select
                        aria-label="Number of images"
                        value={node.image?.n ?? 1}
                        onChange={(event) => updateImage({ n: Number(event.target.value) })}
                      >
                        {countOptionsFor(entry.model.supportedParameters.n, 10).map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </label>
                    {enums("resolution").length > 0 && (
                      <SelectField
                        label="Resolution"
                        value={node.image?.resolution}
                        values={enums("resolution")}
                        onChange={(value) =>
                          value ? updateImage({ resolution: value }) : clearImage("resolution")
                        }
                      />
                    )}
                    {enums("size").length > 0 && (
                      <SelectField
                        label="Pixel size"
                        value={node.image?.size}
                        values={enums("size")}
                        onChange={(value) =>
                          value ? updateImage({ size: value }) : clearImage("size")
                        }
                      />
                    )}
                  </div>
                )}
                {node.kind === "video" && videoModel && (
                  <div className="zf-field-grid">
                    {!!videoModel.supportedAspectRatios.length && (
                      <SelectField
                        label="Aspect ratio"
                        value={node.video?.aspectRatio}
                        values={videoModel.supportedAspectRatios}
                        onChange={(value) =>
                          value ? updateVideo({ aspectRatio: value }) : clearVideo("aspectRatio")
                        }
                      />
                    )}
                    <label className="zf-field">
                      <span>Videos</span>
                      <select
                        aria-label="Number of videos"
                        value={node.videoCount}
                        onChange={(event) =>
                          onChange(node.id, { videoCount: Number(event.target.value) })
                        }
                      >
                        {[1, 2, 3, 4].map((count) => (
                          <option key={count}>{count}</option>
                        ))}
                      </select>
                    </label>
                    {!!videoModel.supportedDurations.length && (
                      <SelectField
                        label="Duration (s)"
                        value={node.video?.duration}
                        values={videoModel.supportedDurations}
                        onChange={(value) =>
                          value ? updateVideo({ duration: Number(value) }) : clearVideo("duration")
                        }
                      />
                    )}
                    {!!videoModel.supportedResolutions.length && (
                      <SelectField
                        label="Resolution"
                        value={node.video?.resolution}
                        values={videoModel.supportedResolutions}
                        onChange={(value) =>
                          value ? updateVideo({ resolution: value }) : clearVideo("resolution")
                        }
                      />
                    )}
                  </div>
                )}
                <details className="zf-instructions">
                  <summary>Additional instructions {connected && <span>· Connected</span>}</summary>
                  <textarea
                    aria-label="Additional instructions"
                    placeholder="Add details for this card, or write a standalone prompt."
                    value={node.text}
                    onChange={(event) => onChange(node.id, { text: event.target.value })}
                  />
                  {connected && <p className="zf-connected-prompt">{connected}</p>}
                </details>
                <button
                  type="button"
                  className="zf-advanced-toggle"
                  aria-expanded={advanced}
                  onClick={() => setAdvanced(!advanced)}
                >
                  Advanced settings <span>{advanced ? "−" : "+"}</span>
                </button>
                {advanced && (
                  <div className="zf-advanced">
                    {node.kind === "image" && node.image && entry && (
                      <>
                        <div className="zf-field-grid">
                          {enums("quality").length > 0 && (
                            <SelectField
                              label="Quality"
                              value={node.image.quality}
                              values={enums("quality")}
                              onChange={(value) => {
                                const quality = value as ImageGenerationInput["quality"];
                                if (quality) updateImage({ quality });
                                else clearImage("quality");
                              }}
                            />
                          )}
                          {enums("output_format").length > 0 && (
                            <SelectField
                              label="Format"
                              value={node.image.outputFormat}
                              values={enums("output_format")}
                              onChange={(value) => {
                                const outputFormat = value as ImageGenerationInput["outputFormat"];
                                if (outputFormat) updateImage({ outputFormat });
                                else clearImage("outputFormat");
                              }}
                            />
                          )}
                          {enums("background").length > 0 && (
                            <SelectField
                              label="Background"
                              value={node.image.background}
                              values={enums("background")}
                              onChange={(value) => {
                                if (
                                  value === "auto" ||
                                  value === "transparent" ||
                                  value === "opaque"
                                )
                                  updateImage({ background: value });
                                else clearImage("background");
                              }}
                            />
                          )}
                          {entry.model.supportedParameters.output_compression && (
                            <label className="zf-field">
                              <span>Compression (0–100)</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={node.image.outputCompression ?? ""}
                                placeholder="Auto"
                                onChange={(event) =>
                                  event.target.value
                                    ? updateImage({ outputCompression: Number(event.target.value) })
                                    : clearImage("outputCompression")
                                }
                              />
                            </label>
                          )}
                          {entry.model.supportedParameters.seed && (
                            <label className="zf-field">
                              <span>Seed</span>
                              <input
                                type="number"
                                step="1"
                                value={node.image.seed ?? ""}
                                placeholder="Random"
                                onChange={(event) =>
                                  event.target.value
                                    ? updateImage({ seed: Number(event.target.value) })
                                    : clearImage("seed")
                                }
                              />
                            </label>
                          )}
                        </div>
                        {!!node.image.inputReferences?.length && (
                          <div className="zf-inherited-refs">
                            <span>
                              {node.image.inputReferences.length} attached reference
                              {node.image.inputReferences.length === 1 ? "" : "s"} from saved
                              settings
                            </span>
                            <button type="button" onClick={() => clearImage("inputReferences")}>
                              Remove attached references
                            </button>
                          </div>
                        )}
                        <CreativeDirectionPanel
                          value={node.image.creativeDirection}
                          disabled={disabled}
                          preview={prepareImagePrompt({
                            ...node.image,
                            prompt: [connected, node.text.trim()].filter(Boolean).join("\n\n"),
                          })}
                          onChange={(value) =>
                            value
                              ? updateImage({ creativeDirection: value })
                              : clearImage("creativeDirection")
                          }
                        />
                        {entry.model.civitai && (
                          <CivitaiAdvancedSettings
                            model={entry.model}
                            providerInstanceId={node.image.providerInstanceId}
                            value={node.image.civitai ?? {}}
                            disabled={disabled}
                            onChange={(value) => updateImage({ civitai: value })}
                          />
                        )}
                      </>
                    )}
                    {node.kind === "video" && node.video && videoModel && (
                      <>
                        {videoModel.upscaleFactor && (
                          <label className="zf-field">
                            <span>Upscale factor</span>
                            <input
                              type="number"
                              min={videoModel.upscaleFactor.min}
                              max={videoModel.upscaleFactor.max}
                              value={node.video.upscaleFactor ?? ""}
                              placeholder="Auto"
                              onChange={(event) =>
                                event.target.value
                                  ? updateVideo({ upscaleFactor: Number(event.target.value) })
                                  : clearVideo("upscaleFactor")
                              }
                            />
                          </label>
                        )}
                        {!!videoModel.creativity?.length && (
                          <SelectField
                            label="Creativity"
                            value={node.video.creativity}
                            values={videoModel.creativity}
                            onChange={(value) =>
                              value
                                ? updateVideo({ creativity: Number(value) })
                                : clearVideo("creativity")
                            }
                          />
                        )}
                        {videoModel.generateAudio && (
                          <label>
                            <input
                              type="checkbox"
                              checked={node.video.generateAudio ?? false}
                              onChange={(event) =>
                                updateVideo({ generateAudio: event.target.checked })
                              }
                            />{" "}
                            Generate audio
                          </label>
                        )}
                        {!!videoModel.supportedSizes.length && (
                          <SelectField
                            label="Pixel size"
                            value={node.video.size}
                            values={videoModel.supportedSizes}
                            onChange={(value) => {
                              if (value) {
                                const {
                                  resolution: _resolution,
                                  aspectRatio: _ratio,
                                  ...rest
                                } = node.video!;
                                onChange(node.id, { video: { ...rest, size: value } });
                              } else clearVideo("size");
                            }}
                          />
                        )}
                        {videoModel.supportsSeed && (
                          <label className="zf-field">
                            <span>Seed</span>
                            <input
                              type="number"
                              step="1"
                              value={node.video.seed ?? ""}
                              placeholder="Random"
                              onChange={(event) =>
                                event.target.value
                                  ? updateVideo({ seed: Number(event.target.value) })
                                  : clearVideo("seed")
                              }
                            />
                          </label>
                        )}
                      </>
                    )}
                  </div>
                )}
                <button type="button" className="zf-generate" onClick={() => onRun(node.id)}>
                  Generate {node.kind}
                  <span>↗</span>
                </button>
              </fieldset>
            )}
            {node.libraryAsset && (
              <div className="zf-library-label">Library asset · Original preserved</div>
            )}
            {(status ||
              videoRecords.some((record) => record.error || !terminalRecord(record.status))) && (
              <p
                className={`zf-status ${status?.state === "error" ? "zf-error" : ""}`}
                role="status"
              >
                {videoRecords.find((record) => record.error)?.error ||
                  (videoRecords.some((record) => !terminalRecord(record.status))
                    ? "Video processing · status updates automatically"
                    : status?.message)}
              </p>
            )}
          </>
        )}
      </div>
      {node.collapsed && (
        <div className="zf-collapsed-summary">
          {node.kind === "text"
            ? node.text || "Empty prompt"
            : (node.image?.model ?? node.video?.model ?? "Choose a model")}
        </div>
      )}
    </article>
  );
});
