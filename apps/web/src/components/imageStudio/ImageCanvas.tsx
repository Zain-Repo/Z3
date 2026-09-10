import type { ImageGenerationRecord } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { LazyGeneratedImageTile } from "../ImageGenerationGallery";
import type { LoadImageContent } from "../imageContentLoader";

export type CanvasImage = {
  readonly generation: ImageGenerationRecord;
  readonly assetId: string;
};

export function ImageCanvas({
  images,
  comparing,
  onComparingChange,
  loadImageContent,
}: {
  readonly images: ReadonlyArray<CanvasImage>;
  readonly comparing: boolean;
  readonly onComparingChange: (value: boolean) => void;
  readonly loadImageContent: LoadImageContent;
}) {
  return (
    <section aria-label="Image canvas" className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{comparing ? "Compare images" : "Canvas"}</h2>
        <Button
          variant={comparing ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={comparing}
          disabled={images.length === 0}
          onClick={() => onComparingChange(!comparing)}
        >
          {comparing ? "Exit comparison" : "Compare two images"}
        </Button>
      </div>
      {images.length > 0 ? (
        <div className={comparing ? "grid gap-3 sm:grid-cols-2" : "grid"}>
          {images.map(({ generation, assetId }, index) => (
            <figure key={assetId} className="min-w-0">
              <div className="h-[32vh] min-h-48 overflow-hidden rounded-xl bg-muted/30 sm:h-[42vh]">
                <LazyGeneratedImageTile
                  assetId={assetId}
                  alt={
                    generation.assets.find((asset) => asset.id === assetId)?.revisedPrompt ??
                    generation.prompt
                  }
                  loadImageContent={loadImageContent}
                />
              </div>
              <figcaption className="mt-2 flex gap-2 text-xs text-muted-foreground">
                {comparing ? (
                  <span className="font-medium text-foreground">{index === 0 ? "A" : "B"}</span>
                ) : null}
                <span className="line-clamp-2">{generation.prompt}</span>
              </figcaption>
            </figure>
          ))}
          {comparing && images.length === 1 ? (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Select another image below to compare it.
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
