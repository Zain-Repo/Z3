import { describe, expect, it } from "vite-plus/test";
import { resolveCanvasSelection, selectCanvasAsset } from "./canvasSelection";

describe("image canvas selection", () => {
  const assets = [{ assetId: "newest" }, { assetId: "older" }, { assetId: "third" }];

  it("starts with the newest available image and handles an empty library", () => {
    expect(resolveCanvasSelection(assets, [], false)).toEqual([assets[0]]);
    expect(resolveCanvasSelection([], ["deleted"], true)).toEqual([]);
  });

  it("pins the first comparison image while replacing the second", () => {
    expect(selectCanvasAsset("third", "older", true)).toEqual(["older", "third"]);
    expect(selectCanvasAsset("older", "older", true)).toEqual(["older"]);
    expect(selectCanvasAsset("third", "older", false)).toEqual(["third"]);
  });

  it("drops filtered or deleted selections and falls back only when none survive", () => {
    expect(resolveCanvasSelection(assets, ["deleted", "older"], true)).toEqual([assets[1]]);
    expect(resolveCanvasSelection(assets, ["deleted"], false)).toEqual([assets[0]]);
  });

  it("shows one image after leaving comparison without losing the chosen ordering", () => {
    expect(resolveCanvasSelection(assets, ["third", "older"], false)).toEqual([assets[2]]);
    expect(resolveCanvasSelection(assets, ["third", "older"], true)).toEqual([
      assets[2],
      assets[1],
    ]);
  });
});
