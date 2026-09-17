export interface WorkspaceFileDragEvent {
  readonly dataTransfer: {
    readonly types: ReadonlyArray<string>;
    readonly files: Iterable<File>;
    dropEffect: string;
  };
  readonly relatedTarget: EventTarget | null;
  readonly currentTarget: { contains(target: Node | null): boolean };
  preventDefault(): void;
  stopPropagation(): void;
}

/** Accept OS files without intercepting sidebar reordering or workspace mentions. */
export function makeWorkspaceFileDropHandlers(host: {
  setDragActive(active: boolean): void;
  addFiles(files: File[]): void;
}) {
  const claim = (event: WorkspaceFileDragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };
  return {
    onDragEnter(event: WorkspaceFileDragEvent) {
      if (claim(event)) host.setDragActive(true);
    },
    onDragOver(event: WorkspaceFileDragEvent) {
      if (!claim(event)) return;
      event.dataTransfer.dropEffect = "copy";
      host.setDragActive(true);
    },
    onDragLeave(event: WorkspaceFileDragEvent) {
      if (!claim(event)) return;
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
        return;
      host.setDragActive(false);
    },
    onDrop(event: WorkspaceFileDragEvent) {
      if (!claim(event)) return;
      host.setDragActive(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) host.addFiles(files);
    },
  };
}
