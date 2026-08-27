import { assert, describe, it } from "@effect/vitest";

import { imageAspectRatio, imageGridAspectRatio } from "./imageGenerationAspectRatio";

describe("image generation aspect ratios", () => {
  it("uses explicit pixel dimensions before the requested aspect ratio", () => {
    assert.equal(imageAspectRatio({ size: "1536x1024", aspectRatio: "1:1" }), 1.5);
  });

  it("supports colon and slash aspect-ratio formats", () => {
    assert.equal(imageAspectRatio({ aspectRatio: "9:16" }), 9 / 16);
    assert.equal(imageAspectRatio({ aspectRatio: "16 / 9" }), 16 / 9);
  });

  it("falls back to a square for missing or invalid dimensions", () => {
    assert.equal(imageAspectRatio(undefined), 1);
    assert.equal(imageAspectRatio({ aspectRatio: "wide" }), 1);
    assert.equal(imageAspectRatio({ size: "1024x0" }), 1);
  });

  it("preserves each tile ratio in multi-image grids", () => {
    assert.equal(imageGridAspectRatio({ aspectRatio: "16:9" }, 2), 32 / 9);
    assert.equal(imageGridAspectRatio({ aspectRatio: "16:9" }, 4), 16 / 9);
    assert.equal(imageGridAspectRatio({ aspectRatio: "9:16" }, 3), 9 / 16);
  });
});
