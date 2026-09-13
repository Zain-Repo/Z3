import { useEffect, useRef, useState } from "react";
import type { ImageContent, LoadImageContent } from "../imageContentLoader";
import { clampCanvasPan } from "./viewportMath";

export function CanvasViewport({
  assetId,
  alt,
  zoom,
  loadImageContent,
}: {
  readonly assetId: string;
  readonly alt: string;
  readonly zoom: number;
  readonly loadImageContent: LoadImageContent;
}) {
  const [content, setContent] = useState<ImageContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [dimensions, setDimensions] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const pan = useRef({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void loadImageContent(assetId)
      .then((result) => {
        if (active) setContent(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [assetId, loadImageContent, attempt]);

  useEffect(() => {
    pan.current = { x: 0, y: 0 };
    surface.current?.style.setProperty("--pan-x", "0px");
    surface.current?.style.setProperty("--pan-y", "0px");
    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [zoom]);

  const move = (x: number, y: number) => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds) return;
    pan.current = clampCanvasPan(x, y, zoom, bounds.width, bounds.height);
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      surface.current?.style.setProperty("--pan-x", `${pan.current.x}px`);
      surface.current?.style.setProperty("--pan-y", `${pan.current.y}px`);
      frame.current = null;
    });
  };

  return (
    <div
      ref={viewport}
      className="zimage-viewport relative overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      role="group"
      aria-label={`Image inspection: ${alt}. At magnification, drag or use arrow keys to pan.`}
      tabIndex={0}
      onKeyDown={(event) => {
        const steps: Record<string, readonly [number, number]> = {
          ArrowLeft: [40, 0],
          ArrowRight: [-40, 0],
          ArrowUp: [0, 40],
          ArrowDown: [0, -40],
        };
        const step = steps[event.key];
        if (!step || zoom <= 1) return;
        event.preventDefault();
        move(pan.current.x + step[0], pan.current.y + step[1]);
      }}
      onPointerDown={(event) => {
        if (zoom <= 1 || event.button !== 0) return;
        event.currentTarget.focus();
        drag.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const previous = drag.current;
        if (!previous || previous.pointerId !== event.pointerId) return;
        move(
          pan.current.x + event.clientX - previous.x,
          pan.current.y + event.clientY - previous.y,
        );
        drag.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      }}
      onPointerUp={(event) => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      data-zoomed={zoom > 1}
    >
      {failed ? (
        <button
          className="absolute inset-0 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setFailed(false);
            setContent(null);
            setAttempt((value) => value + 1);
          }}
          type="button"
        >
          Image unavailable. Retry
        </button>
      ) : content ? (
        <div
          ref={surface}
          className="zimage-image-surface size-full"
          style={{ scale: String(zoom) }}
        >
          <img
            src={`data:${content.mediaType};base64,${content.data}`}
            alt={alt}
            draggable={false}
            decoding="async"
            onLoad={(event) =>
              setDimensions(
                `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`,
              )
            }
            onError={() => setFailed(true)}
            className="size-full select-none object-contain"
          />
        </div>
      ) : (
        <div
          role="status"
          className="flex size-full items-center justify-center text-xs text-muted-foreground"
        >
          Loading image…
        </div>
      )}
      {dimensions && !failed ? (
        <span className="pointer-events-none absolute bottom-3 left-3 rounded bg-background/90 px-2 py-1 font-mono text-[10px] tabular-nums text-muted-foreground">
          {dimensions} px
        </span>
      ) : null}
    </div>
  );
}
