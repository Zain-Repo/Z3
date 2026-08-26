import { describe, expect, it, vi } from "vite-plus/test";

import { createImageContentLoader, type ImageContent } from "./imageContentLoader";

const content: ImageContent = { mediaType: "image/png", data: "encoded-image" };

describe("createImageContentLoader", () => {
  it("deduplicates concurrent and completed asset requests", async () => {
    const fetchContent = vi.fn(async () => content);
    const loader = createImageContentLoader(fetchContent);

    const first = loader.load("asset-1");
    const second = loader.load("asset-1");

    expect(first).toBe(second);
    await expect(first).resolves.toBe(content);
    await expect(loader.load("asset-1")).resolves.toBe(content);
    expect(fetchContent).toHaveBeenCalledTimes(1);
  });

  it("evicts failed and explicitly deleted requests", async () => {
    const fetchContent = vi
      .fn<() => Promise<ImageContent>>()
      .mockRejectedValueOnce(new Error("preview failed"))
      .mockResolvedValue(content);
    const loader = createImageContentLoader(fetchContent);

    await expect(loader.load("asset-1")).rejects.toThrow("preview failed");
    await expect(loader.load("asset-1")).resolves.toBe(content);
    loader.delete("asset-1");
    await expect(loader.load("asset-1")).resolves.toBe(content);
    expect(fetchContent).toHaveBeenCalledTimes(3);
  });

  it("bounds simultaneous content requests", async () => {
    let resolveFirst: ((value: ImageContent) => void) | undefined;
    const firstResult = new Promise<ImageContent>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchContent = vi
      .fn<(assetId: string) => Promise<ImageContent>>()
      .mockReturnValueOnce(firstResult)
      .mockResolvedValue(content);
    const loader = createImageContentLoader(fetchContent, 1);

    const first = loader.load("asset-1");
    const second = loader.load("asset-2");
    await Promise.resolve();
    expect(fetchContent).toHaveBeenCalledTimes(1);

    resolveFirst?.(content);
    await expect(first).resolves.toBe(content);
    await expect(second).resolves.toBe(content);
    expect(fetchContent).toHaveBeenCalledTimes(2);
  });
});
