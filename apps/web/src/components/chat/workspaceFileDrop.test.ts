import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { makeWorkspaceFileDropHandlers, type WorkspaceFileDragEvent } from "./workspaceFileDrop";

function event(types: string[] = ["Files"], files: File[] = []): WorkspaceFileDragEvent {
  return {
    dataTransfer: { types, files, dropEffect: "none" },
    relatedTarget: null,
    currentTarget: { contains: () => false },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("workspace file drops", () => {
  it("ignores internal mentions and text drags", () => {
    const host = { setDragActive: vi.fn(), addFiles: vi.fn() };
    const handlers = makeWorkspaceFileDropHandlers(host);
    const drag = event(["application/x-t3code-composer-mention", "text/plain"]);
    for (const handler of Object.values(handlers)) handler(drag);
    expect(drag.preventDefault).not.toHaveBeenCalled();
    expect(drag.stopPropagation).not.toHaveBeenCalled();
    expect(host.setDragActive).not.toHaveBeenCalled();
    expect(host.addFiles).not.toHaveBeenCalled();
  });

  it("claims an OS file drop and delivers its files once", () => {
    const host = { setDragActive: vi.fn(), addFiles: vi.fn() };
    const handlers = makeWorkspaceFileDropHandlers(host);
    const files = [new File(["image"], "example.png", { type: "image/png" })];
    const drag = event(["Files"], files);
    handlers.onDragEnter(drag);
    handlers.onDragOver(drag);
    expect(drag.dataTransfer.dropEffect).toBe("copy");
    expect(host.setDragActive).toHaveBeenLastCalledWith(true);
    handlers.onDrop(drag);
    expect(host.setDragActive).toHaveBeenLastCalledWith(false);
    expect(host.addFiles).toHaveBeenCalledExactlyOnceWith(files);
    expect(drag.stopPropagation).toHaveBeenCalledTimes(3);
  });

  it("keeps the highlight while moving between children and clears it on exit", () => {
    class MockNode extends EventTarget {}
    vi.stubGlobal("Node", MockNode);
    const host = { setDragActive: vi.fn(), addFiles: vi.fn() };
    const handlers = makeWorkspaceFileDropHandlers(host);
    handlers.onDragLeave({
      ...event(),
      relatedTarget: new MockNode(),
      currentTarget: { contains: () => true },
    });
    expect(host.setDragActive).not.toHaveBeenCalled();
    handlers.onDragLeave(event());
    expect(host.setDragActive).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("does not navigate for empty drops", () => {
    const host = { setDragActive: vi.fn(), addFiles: vi.fn() };
    makeWorkspaceFileDropHandlers(host).onDrop(event());
    expect(host.addFiles).not.toHaveBeenCalled();
  });
});
