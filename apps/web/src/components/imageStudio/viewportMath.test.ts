import { describe, expect, it } from "vite-plus/test";
import { clampCanvasPan, clampCanvasZoom } from "./viewportMath";

describe("canvas viewport", () => {
  it("limits magnification to the useful inspection range", () => {
    expect(clampCanvasZoom(0)).toBe(1);
    expect(clampCanvasZoom(2.5)).toBe(2.5);
    expect(clampCanvasZoom(8)).toBe(4);
    expect(clampCanvasZoom(Number.NaN)).toBe(1);
  });
  it("keeps the image centered at fit and bounds dragging when zoomed", () => {
    expect(clampCanvasPan(300, -300, 1, 400, 200)).toEqual({ x: 0, y: -0 });
    expect(clampCanvasPan(300, -300, 2, 400, 200)).toEqual({ x: 200, y: -100 });
    expect(clampCanvasPan(30, -20, 2, 400, 200)).toEqual({ x: 30, y: -20 });
  });
});
