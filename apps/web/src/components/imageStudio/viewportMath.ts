export const MIN_CANVAS_ZOOM = 1;
export const MAX_CANVAS_ZOOM = 4;

export function clampCanvasZoom(zoom: number): number {
  return Number.isFinite(zoom) ? Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom)) : 1;
}

export function clampCanvasPan(x: number, y: number, zoom: number, width: number, height: number) {
  const limitX = Math.max(0, (width * (clampCanvasZoom(zoom) - 1)) / 2);
  const limitY = Math.max(0, (height * (clampCanvasZoom(zoom) - 1)) / 2);
  return { x: Math.max(-limitX, Math.min(limitX, x)), y: Math.max(-limitY, Math.min(limitY, y)) };
}
