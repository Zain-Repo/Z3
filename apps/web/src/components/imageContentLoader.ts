export type ImageContent = { readonly mediaType: string; readonly data: string };
export type LoadImageContent = (assetId: string) => Promise<ImageContent>;

export interface ImageContentLoader {
  readonly load: LoadImageContent;
  readonly delete: (assetId: string) => void;
}

/** Keeps one in-flight or completed content request per asset for the workspace lifetime. */
export function createImageContentLoader(
  fetchContent: LoadImageContent,
  maxConcurrentRequests = 4,
): ImageContentLoader {
  if (!Number.isInteger(maxConcurrentRequests) || maxConcurrentRequests < 1) {
    throw new RangeError("maxConcurrentRequests must be a positive integer.");
  }

  const requests = new Map<string, Promise<ImageContent>>();
  const queue: Array<() => void> = [];
  let activeRequestCount = 0;

  const schedule = (assetId: string): Promise<ImageContent> =>
    new Promise((resolve, reject) => {
      const run = () => {
        activeRequestCount += 1;
        void Promise.resolve()
          .then(() => fetchContent(assetId))
          .then(resolve, reject)
          .finally(() => {
            activeRequestCount -= 1;
            queue.shift()?.();
          });
      };

      if (activeRequestCount < maxConcurrentRequests) run();
      else queue.push(run);
    });

  const load: LoadImageContent = (assetId) => {
    const cached = requests.get(assetId);
    if (cached) return cached;

    const request = schedule(assetId).catch((cause) => {
      if (requests.get(assetId) === request) requests.delete(assetId);
      throw cause;
    });
    requests.set(assetId, request);
    return request;
  };

  return {
    load,
    delete: (assetId) => requests.delete(assetId),
  };
}
