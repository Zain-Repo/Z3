import type { ImageGenerationRecord } from "@t3tools/contracts";
import { useState } from "react";
import { prepareImagePrompt } from "@t3tools/shared/imageCreativeDirection";
import { Button } from "../ui/button";
import type { LoadImageContent } from "../imageContentLoader";
import { CanvasViewport } from "./CanvasViewport";
import { clampCanvasZoom } from "./viewportMath";
import { reusableImageGenerationInput } from "../../lib/imageGenerationPayload";

export type CanvasImage = {
  readonly generation: ImageGenerationRecord;
  readonly assetId: string;
};

export function ImageCanvas({
  images,
  comparing,
  onComparingChange,
  loadImageContent,
  onUseReference,
  disabled,
}: {
  readonly images: ReadonlyArray<CanvasImage>;
  readonly comparing: boolean;
  readonly onComparingChange: (value: boolean) => void;
  readonly loadImageContent: LoadImageContent;
  readonly onUseReference: (assetId: string) => Promise<void>;
  readonly disabled: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const download = async (assetId: string) => {
    try {
      const content = await loadImageContent(assetId);
      const extension =
        content.mediaType.replace("image/", "").replace("svg+xml", "svg").split(";")[0] ?? "png";
      const anchor = document.createElement("a");
      anchor.href = `data:${content.mediaType};base64,${content.data}`;
      anchor.download = `zimage-${assetId}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setError(null);
    } catch {
      setError("Could not download the original image. Please retry.");
    }
  };

  return (
    <section
      aria-label="Image canvas"
      className="zimage-stage overflow-hidden rounded-xl border border-border/70"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/95 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{comparing ? "Comparison canvas" : "Canvas"}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {comparing
              ? "Select up to four images below. Zoom is shared across views."
              : "Inspect the full frame. Zoom in to check texture and detail."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => setZoom((value) => clampCanvasZoom(value - 0.5))}
          >
            −
          </Button>
          <span className="min-w-10 text-center font-mono text-xs tabular-nums" aria-live="polite">
            {zoom.toFixed(1)}×
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Zoom in"
            disabled={zoom >= 4}
            onClick={() => setZoom((value) => clampCanvasZoom(value + 0.5))}
          >
            +
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
            Fit
          </Button>
          <Button
            variant={comparing ? "secondary" : "outline"}
            size="sm"
            aria-pressed={comparing}
            onClick={() => {
              onComparingChange(!comparing);
              setZoom(1);
            }}
          >
            {comparing ? "Single image" : "Compare"}
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className={comparing ? "grid gap-4 p-4 sm:grid-cols-2" : "p-4 sm:p-6"}>
        {images.map(({ generation, assetId }, index) => (
          <figure
            key={assetId}
            className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm"
          >
            <CanvasViewport
              key={assetId}
              assetId={assetId}
              alt={generation.prompt}
              zoom={zoom}
              loadImageContent={loadImageContent}
            />
            <figcaption className="space-y-3 border-t border-border/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {comparing ? (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted font-mono text-xs">
                      {String.fromCharCode(65 + index)}
                    </span>
                  ) : null}
                  <span className="break-all text-xs font-semibold">{generation.model}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled || referenceBusy}
                    onClick={async () => {
                      setReferenceBusy(true);
                      try {
                        await onUseReference(assetId);
                      } catch {
                        setError("Could not add the reference image.");
                      } finally {
                        setReferenceBusy(false);
                      }
                    }}
                  >
                    Use as reference
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void download(assetId)}>
                    Download
                  </Button>
                </div>
              </div>
              <details>
                <summary
                  className="cursor-pointer truncate text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={generation.prompt}
                >
                  {generation.prompt}
                </summary>
                <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <p className="font-medium text-foreground">Model prompt</p>
                  <p className="whitespace-pre-wrap break-words">
                    {prepareImagePrompt(reusableImageGenerationInput(generation))}
                  </p>
                  <p className="font-mono text-[10px]">
                    {generation.input?.resolution ??
                      generation.input?.size ??
                      "Model default resolution"}{" "}
                    · {generation.input?.quality ?? "auto"} quality
                    {generation.input?.seed !== undefined ? ` · Seed ${generation.input.seed}` : ""}
                  </p>
                </div>
              </details>
            </figcaption>
          </figure>
        ))}
        {comparing && images.length === 1 ? (
          <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Select more images below to compare them here.
          </div>
        ) : null}
      </div>
      <div className="border-t border-border/70 bg-background/90 px-4 py-2 text-[10px] text-muted-foreground">
        Fit preserves the complete image. Magnification enlarges the preview; drag or use arrow keys
        to inspect. Downloads retain the original file.
      </div>
    </section>
  );
}
