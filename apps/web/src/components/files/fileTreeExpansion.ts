export interface FileTreeExpansionModel {
  getItem(path: string): unknown;
  resetPaths?: (
    paths: readonly string[],
    options?: { readonly initialExpandedPaths?: readonly string[] },
  ) => void;
}

type DirectoryHandle = {
  isDirectory(): boolean;
  isExpanded(): boolean;
  expand(): void;
  collapse(): void;
};

function asDirectoryHandle(item: unknown): DirectoryHandle | null {
  if (
    typeof item !== "object" ||
    item === null ||
    !("isDirectory" in item) ||
    typeof item.isDirectory !== "function" ||
    !item.isDirectory() ||
    !("isExpanded" in item) ||
    typeof item.isExpanded !== "function" ||
    !("expand" in item) ||
    typeof item.expand !== "function" ||
    !("collapse" in item) ||
    typeof item.collapse !== "function"
  ) {
    return null;
  }
  return item as DirectoryHandle;
}

export function areAllDirectoriesExpanded(
  model: FileTreeExpansionModel,
  directoryPaths: readonly string[],
): boolean {
  return (
    directoryPaths.length > 0 &&
    directoryPaths.every((path) => {
      const item = asDirectoryHandle(model.getItem(path));
      return item !== null && item.isExpanded();
    })
  );
}

export function setAllDirectoriesExpanded(
  model: FileTreeExpansionModel,
  directoryPaths: readonly string[],
  expanded: boolean,
  allPaths?: readonly string[],
): void {
  // Rebuilding the store once lets the tree initialize expansion state in one
  // pass. Calling every item handle separately causes a projection rebuild for
  // each directory, which becomes noticeably expensive in large workspaces.
  if (model.resetPaths !== undefined && allPaths !== undefined) {
    model.resetPaths(allPaths, {
      initialExpandedPaths: expanded ? directoryPaths : [],
    });

    // The file browser uses one-level initial expansion. Collapse those root
    // directories explicitly when the requested final state is fully closed.
    if (!expanded) {
      for (const path of directoryPaths) {
        if (path.slice(0, -1).includes("/")) continue;
        const item = asDirectoryHandle(model.getItem(path));
        if (item?.isExpanded()) item.collapse();
      }
    }
    return;
  }

  for (const path of directoryPaths) {
    const item = asDirectoryHandle(model.getItem(path));
    if (item === null || item.isExpanded() === expanded) continue;
    if (expanded) item.expand();
    else item.collapse();
  }
}
