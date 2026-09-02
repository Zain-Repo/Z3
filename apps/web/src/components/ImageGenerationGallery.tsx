import type { ImageGenerationInput, ImageGenerationRecord } from "@t3tools/contracts";
import {
  CheckIcon,
  Code2Icon,
  CopyIcon,
  DownloadIcon,
  Maximize2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { imageGridAspectRatio } from "../lib/imageGenerationAspectRatio";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";
import type { ImageContent, LoadImageContent } from "./imageContentLoader";
import {
  copyTextToClipboard,
  reusableImageGenerationInput,
  serializeImageGenerationPayload,
} from "../lib/imageGenerationPayload";

export function PendingGenerationCard({
  input,
  onCancel,
}: {
  readonly input: ImageGenerationInput;
  readonly onCancel: () => void;
}) {
  const count = input.n ?? 1;
  const elapsedSeconds = useElapsedSeconds();

  return (
    <article
      aria-busy="true"
      aria-label={`Generating ${count} image${count === 1 ? "" : "s"}`}
      className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card/30 shadow-sm/5"
    >
      <div
        style={{ aspectRatio: imageGridAspectRatio(input, count) }}
        className={cn(
          "relative grid auto-rows-fr overflow-hidden bg-muted/35",
          count > 1 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {Array.from({ length: count }, (_, index) => (
          <ImageSkeletonTile key={index} />
        ))}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-2">
          <span
            role="timer"
            aria-label={`Elapsed generation time ${formatElapsedTime(elapsedSeconds)}`}
            className="rounded-md bg-background/75 px-2 py-1 font-mono text-[11px] font-medium tabular-nums text-foreground/80 shadow-sm/10 backdrop-blur-sm"
          >
            {formatElapsedTime(elapsedSeconds)}
          </span>
        </div>
      </div>
      <div className="border-t border-border/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground/80">
            <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            <span className="truncate">
              Generating {count} image{count === 1 ? "" : "s"}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Stop image generation"
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <SquareIcon className="size-3" aria-hidden="true" />
            Stop
          </button>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {input.prompt}
        </p>
      </div>
    </article>
  );
}

function monotonicNow(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function useElapsedSeconds(): number {
  const startedAt = useRef(monotonicNow());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const updateElapsed = () => {
      setElapsedSeconds(Math.floor((monotonicNow() - startedAt.current) / 1000));
    };

    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return elapsedSeconds;
}

function formatElapsedTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export const GenerationCard = memo(function GenerationCard({
  generation,
  loadImageContent,
  onDelete,
  onReuse,
  onReroll,
}: {
  readonly generation: ImageGenerationRecord;
  readonly loadImageContent: LoadImageContent;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onReuse: (input: ImageGenerationInput) => void;
  readonly onReroll: (input: ImageGenerationInput) => void;
}) {
  const [copiedAction, setCopiedAction] = useState<"prompt" | "json" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const reusableInput = reusableImageGenerationInput(generation);
  const seed = generation.input?.seed;

  const copy = async (action: "prompt" | "json", value: string) => {
    try {
      await copyTextToClipboard(value);
      setCopiedAction(action);
      setCopyFailed(false);
      window.setTimeout(() => setCopiedAction(null), 1400);
    } catch {
      setCopyFailed(true);
    }
  };

  const downloadFirstAsset = async () => {
    const asset = generation.assets[0];
    if (!asset) return;
    try {
      const content = await loadImageContent(asset.id);
      const extension =
        content.mediaType.replace("image/", "").replace("svg+xml", "svg").split(";")[0] ?? "png";
      const anchor = document.createElement("a");
      anchor.href = `data:${content.mediaType};base64,${content.data}`;
      anchor.download = `zimage-${generation.id.slice(0, 8)}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setDownloadFailed(false);
    } catch {
      setDownloadFailed(true);
    }
  };

  return (
    <article className="group min-w-0 self-start overflow-hidden border border-border/70 bg-card/30 shadow-sm/5 [content-visibility:auto] [contain-intrinsic-size:auto_340px]">
      <div
        style={{ aspectRatio: imageGridAspectRatio(generation.input, generation.assets.length) }}
        className={cn(
          "grid auto-rows-fr overflow-hidden bg-muted/35",
          generation.assets.length > 1 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {generation.assets.map((asset) => (
          <LazyGeneratedImageTile
            key={asset.id}
            assetId={asset.id}
            alt={asset.revisedPrompt ?? generation.prompt}
            loadImageContent={loadImageContent}
          />
        ))}
      </div>
      <div className="border-t border-border/60 p-2.5">
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {generation.prompt}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-1.5">
          <span className="truncate text-[10px] font-medium tabular-nums text-muted-foreground/70">
            {generation.model}
            {seed !== undefined ? ` · seed ${seed}` : ""}
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void copy("prompt", generation.prompt)}
              aria-label="Copy full prompt"
              title="Copy full prompt"
              className="text-muted-foreground hover:text-foreground"
            >
              {copiedAction === "prompt" ? (
                <CheckIcon className="size-3.5 text-emerald-500" aria-hidden="true" />
              ) : (
                <CopyIcon className="size-3.5" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void copy("json", serializeImageGenerationPayload(reusableInput))}
              aria-label="Copy image settings as JSON"
              title="Copy settings as JSON"
              className="text-muted-foreground hover:text-foreground"
            >
              {copiedAction === "json" ? (
                <CheckIcon className="size-3.5 text-emerald-500" aria-hidden="true" />
              ) : (
                <Code2Icon className="size-3.5" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onReuse(reusableInput)}
              aria-label="Reuse image settings"
              title="Reuse settings"
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcwIcon className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onReroll(reusableInput)}
              aria-label="Re-roll with a new seed"
              title="Re-roll with a new seed"
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCwIcon className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void downloadFirstAsset()}
              aria-label="Download first image"
              title="Download first image"
              className="text-muted-foreground hover:text-foreground"
            >
              <DownloadIcon className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void onDelete(generation.id)}
            aria-label="Delete generation"
            title="Delete generation"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
        {copyFailed ? (
          <p className="mt-1 text-[11px] text-destructive" role="status">
            Clipboard unavailable
          </p>
        ) : null}
        {downloadFailed ? (
          <p className="mt-1 text-[11px] text-destructive" role="status">
            Download unavailable
          </p>
        ) : null}
      </div>
    </article>
  );
});

function ImageSkeletonTile() {
  return (
    <div className="relative size-full overflow-hidden bg-muted/35" aria-hidden="true">
      <Skeleton className="absolute inset-0 rounded-none motion-reduce:animate-none" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-background/40 text-muted-foreground/35 shadow-sm/5">
          <SparklesIcon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function LazyGeneratedImageTile({
  assetId,
  alt,
  loadImageContent,
}: {
  readonly assetId: string;
  readonly alt: string;
  readonly loadImageContent: LoadImageContent;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<ImageContent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let active = true;
    let observer: IntersectionObserver | null = null;

    const load = () => {
      void loadImageContent(assetId)
        .then((nextContent) => {
          if (active) setContent(nextContent);
        })
        .catch(() => {
          if (active) setLoadFailed(true);
        });
    };

    const target = containerRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      load();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          load();
        },
        { rootMargin: "800px 0px" },
      );
      observer.observe(target);
    }

    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [assetId, loadImageContent, requestVersion]);

  if (content) {
    return <GeneratedImageTile alt={alt} content={content} />;
  }

  return (
    <div
      ref={containerRef}
      className="relative size-full overflow-hidden bg-muted/35"
      aria-busy={!loadFailed}
    >
      {loadFailed ? (
        <button
          type="button"
          className="flex size-full items-center justify-center px-3 text-center text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setLoadFailed(false);
            setRequestVersion((current) => current + 1);
          }}
        >
          Preview unavailable. Retry
        </button>
      ) : (
        <ImageSkeletonTile />
      )}
    </div>
  );
}

const GeneratedImageTile = memo(function GeneratedImageTile({
  alt,
  content,
}: {
  readonly alt: string;
  readonly content: ImageContent;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const source = useMemo(
    () => `data:${content.mediaType};base64,${content.data}`,
    [content.data, content.mediaType],
  );

  const download = () => {
    const extension =
      content.mediaType.replace("image/", "").replace("svg+xml", "svg").split(";")[0] ?? "png";
    const anchor = document.createElement("a");
    anchor.href = source;
    anchor.download = `zimage-full.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label="View generated image fullscreen"
            className="group/asset relative size-full overflow-hidden bg-muted/35 outline-hidden ring-ring focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-wait"
            disabled={!isLoaded}
          />
        }
      >
        <Skeleton
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-none motion-reduce:animate-none motion-safe:transition-opacity motion-safe:duration-200",
            isLoaded ? "opacity-0" : "opacity-100",
          )}
        />
        <img
          src={source}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onLoad={() => setIsLoaded(true)}
          className={cn(
            "size-full object-cover opacity-0 outline outline-1 -outline-offset-1 outline-black/10 transition-opacity duration-150 motion-reduce:transition-none dark:outline-white/10",
            isLoaded && "opacity-100",
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-[background-color] duration-150 ease-out group-hover/asset:bg-black/25 group-focus-visible/asset:bg-black/25"
        >
          <span className="flex size-10 scale-[0.96] items-center justify-center rounded-full bg-black/70 text-white opacity-0 shadow-lg/20 transition-[scale,opacity] duration-150 ease-out group-hover/asset:scale-100 group-hover/asset:opacity-100 group-focus-visible/asset:scale-100 group-focus-visible/asset:opacity-100 motion-reduce:transition-none">
            <Maximize2Icon className="size-4" />
          </span>
        </span>
      </DialogTrigger>

      <DialogPopup
        bottomStickOnMobile={false}
        showCloseButton={false}
        className="h-[calc(100dvh-2rem)] w-[calc(100dvw-2rem)] max-w-none overflow-hidden rounded-xl border-white/10 bg-black/95 p-0 text-white shadow-2xl"
      >
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 bg-gradient-to-b from-black/75 to-transparent p-3 sm:p-4">
          <DialogTitle className="line-clamp-2 max-w-3xl pt-2 text-sm font-medium leading-relaxed text-white sm:text-base">
            {alt}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Download image"
              title="Download image"
              className="size-10 bg-black/30 text-white hover:bg-white/15 hover:text-white"
              onClick={download}
            >
              <DownloadIcon className="size-5" aria-hidden="true" />
            </Button>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close fullscreen image"
                  className="size-10 bg-black/30 text-white hover:bg-white/15 hover:text-white"
                />
              }
            >
              <XIcon className="size-5" aria-hidden="true" />
            </DialogClose>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-3 pt-16 sm:p-6 sm:pt-20">
          <img
            src={source}
            alt={alt}
            draggable={false}
            decoding="async"
            className="max-h-full max-w-full rounded-lg object-contain outline outline-1 -outline-offset-1 outline-white/10"
          />
        </div>
      </DialogPopup>
    </Dialog>
  );
});
