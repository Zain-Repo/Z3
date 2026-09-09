/** Resolve selection against the current library so deleted or filtered assets cannot linger. */
export function resolveCanvasSelection<T extends { readonly assetId: string }>(
  assets: ReadonlyArray<T>,
  selectedIds: ReadonlyArray<string>,
  comparing: boolean,
): ReadonlyArray<T> {
  const selected = selectedIds.flatMap((id) => assets.find((asset) => asset.assetId === id) ?? []);
  return (selected.length ? selected : assets.slice(0, 1)).slice(0, comparing ? 2 : 1);
}

/** During comparison the first image stays pinned while the second choice changes. */
export function selectCanvasAsset(
  assetId: string,
  firstAssetId: string | undefined,
  comparing: boolean,
): ReadonlyArray<string> {
  return comparing ? Array.from(new Set([firstAssetId ?? assetId, assetId])) : [assetId];
}
