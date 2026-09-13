import { describe, expect, it, vi } from "vite-plus/test";
import { blankFlowBoard, newFlowBoard, type FlowBoard } from "./flowModel";
import { initialFlowSheet, sheetMetadata, sortedFlowSheets, type FlowSheet } from "./flowSheets";
import { FlowSheetSession } from "./flowSheetSession";

function fixture(preferred: string | null = "first") {
  const boards = new Map<string, FlowBoard>([
    ["first", { ...newFlowBoard(), title: "Product study" }],
    ["second", { ...newFlowBoard(), title: "Motion study" }],
  ]);
  const sheets = new Map<string, FlowSheet>(
    Array.from(boards, ([id, board], index) => [
      id,
      sheetMetadata(id, "env", `board:${id}`, board, index + 1),
    ]),
  );
  const storage = {
    initialize: vi.fn(async () => undefined),
    list: vi.fn(async () => sortedFlowSheets([...sheets.values()])),
    create: vi.fn(async (environmentId: string, title: string) => {
      const id = `created-${boards.size}`;
      const board = blankFlowBoard(title);
      boards.set(id, board);
      const sheet = sheetMetadata(id, environmentId, `board:${id}`, board, boards.size);
      sheets.set(id, sheet);
      return sheet;
    }),
    remove: vi.fn(async (_environmentId: string, id: string) => {
      sheets.delete(id);
      boards.delete(id);
      return sortedFlowSheets([...sheets.values()]);
    }),
    preferred: () => preferred,
    remember: vi.fn((_environmentId: string, id: string) => {
      preferred = id;
    }),
  };
  return { boards, sheets, storage, session: new FlowSheetSession("env", storage) };
}

describe("Saved canvas sheets", () => {
  it("migrates the original IndexedDB canvas without changing its board key or contents", () => {
    const board = newFlowBoard();
    const result = initialFlowSheet("env", { revision: 12, board }, "malformed old backup", 42);
    expect(result.board).toBe(board);
    expect(result.sheet.boardKey).toBe("zimage.flow.v1:env");
    expect(result.sheet.nodeCount).toBe(board.nodes.length);
  });
  it("migrates legacy local storage and leaves new users with a blank first sheet", () => {
    const board = newFlowBoard();
    expect(initialFlowSheet("env", null, JSON.stringify(board), 1).board).toEqual(board);
    expect(initialFlowSheet("other", null, null, 1).board.nodes).toEqual([]);
    expect(initialFlowSheet("other", null, null, 1).board.edges).toEqual([]);
    expect(() => initialFlowSheet("env", null, "broken", 1)).toThrow();
  });
  it("restores the last selected sheet and initializes only once for sidebar and canvas", async () => {
    const { session, storage } = fixture("second");
    await Promise.all([session.initialize(), session.initialize()]);
    expect(storage.initialize).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().activeId).toBe("second");
    const reload = new FlowSheetSession("env", storage);
    await reload.initialize();
    expect(reload.getSnapshot().activeId).toBe("second");
  });
  it("saves the current canvas before creating a blank one, preserving previous sheets", async () => {
    const { session, boards, storage } = fixture();
    await session.initialize();
    const first = boards.get("first");
    const calls: string[] = [];
    session.registerEditor("first", async () => {
      calls.push("save");
    });
    storage.create.mockImplementationOnce(async (environmentId, title) => {
      calls.push("create");
      const board = blankFlowBoard(title);
      boards.set("new", board);
      return sheetMetadata("new", environmentId, "board:new", board, 10);
    });
    expect(await session.create()).toBe(true);
    expect(calls).toEqual(["save", "create"]);
    expect(session.getSnapshot().activeId).toBe("new");
    expect(boards.get("new")?.nodes).toEqual([]);
    expect(boards.get("new")?.edges).toEqual([]);
    expect(boards.get("first")).toBe(first);
    expect(storage.remember).toHaveBeenCalledWith("env", "new");
  });
  it("waits for pending edits before switching and rejects repeated new-generation clicks", async () => {
    const { session, storage } = fixture();
    await session.initialize();
    let completeSave: () => void = () => undefined;
    session.registerEditor(
      "first",
      () =>
        new Promise<void>((resolve) => {
          completeSave = resolve;
        }),
    );
    const creation = session.create();
    expect(session.getSnapshot().transitioning).toBe(true);
    expect(session.getSnapshot().activeId).toBe("first");
    expect(await session.create()).toBe(false);
    expect(storage.create).not.toHaveBeenCalled();
    completeSave();
    await creation;
    expect(storage.create).toHaveBeenCalledTimes(1);
  });
  it("retains the current sheet after a save failure instead of opening an empty replacement", async () => {
    const { session, storage } = fixture();
    await session.initialize();
    session.registerEditor("first", async () => {
      throw new Error("Storage quota exceeded");
    });
    expect(await session.create()).toBe(false);
    expect(await session.select("second")).toBe(false);
    expect(session.getSnapshot().activeId).toBe("first");
    expect(session.getSnapshot().error).toContain("Storage quota");
    expect(storage.create).not.toHaveBeenCalled();
    expect(session.getSnapshot().transitioning).toBe(false);
  });
  it("reopens previous sheets and persists selection without replacing their components", async () => {
    const { session, boards, storage } = fixture();
    await session.initialize();
    const original = boards.get("first");
    expect(await session.select("second")).toBe(true);
    expect(await session.select("first")).toBe(true);
    expect(boards.get("first")).toBe(original);
    expect(storage.remember).toHaveBeenLastCalledWith("env", "first");
    session.setLibrary(true);
    await session.select("first");
    expect(session.getSnapshot().libraryOpen).toBe(false);
  });
  it("prevents sheet switching during generation and isolates environments", async () => {
    const { session, storage } = fixture();
    await session.initialize();
    session.setGenerating(true);
    expect(await session.create()).toBe(false);
    expect(await session.select("second")).toBe(false);
    expect(storage.create).not.toHaveBeenCalled();
    expect(session.getSnapshot().error).toContain("current run");
    expect(initialFlowSheet("env-a", null, null, 1).sheet.boardKey).not.toBe(
      initialFlowSheet("env-b", null, null, 1).sheet.boardKey,
    );
  });
  it("refreshes saved names and sorts sheets by recent changes", async () => {
    const { session, sheets } = fixture();
    await session.initialize();
    sheets.set("first", {
      ...sheets.get("first")!,
      title: "Renamed canvas",
      updatedAt: 99,
      nodeCount: 7,
    });
    await session.refresh();
    expect(session.getSnapshot().sheets[0]).toMatchObject({
      id: "first",
      title: "Renamed canvas",
      nodeCount: 7,
    });
  });
});

describe("Canvas deletion", () => {
  it("deletes a previous canvas without changing or flushing the active canvas", async () => {
    const { session, storage } = fixture();
    await session.initialize();
    const flush = vi.fn(async () => undefined);
    session.registerEditor("first", flush);
    expect(await session.remove("second")).toBe(true);
    expect(flush).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith("env", "second");
    expect(session.getSnapshot().activeId).toBe("first");
  });
  it("drains active saves before deletion and opens the remaining canvas", async () => {
    const { session, storage } = fixture();
    await session.initialize();
    session.registerEditor("first", async () => {
      expect(storage.remove).not.toHaveBeenCalled();
    });
    expect(await session.remove("first")).toBe(true);
    expect(session.getSnapshot().activeId).toBe("second");
    expect(storage.remember).toHaveBeenCalledWith("env", "second");
  });
  it("preserves the current sheet on failure and blocks deletion during generation", async () => {
    const { session, storage } = fixture();
    await session.initialize();
    storage.remove.mockRejectedValueOnce(new Error("Storage unavailable"));
    expect(await session.remove("first")).toBe(false);
    expect(session.getSnapshot().activeId).toBe("first");
    expect(session.getSnapshot().error).toBe("Storage unavailable");
    session.setGenerating(true);
    expect(await session.remove("second")).toBe(false);
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });
});

it("selects the atomic blank replacement after deleting the last canvas", async () => {
  const { session, sheets, storage } = fixture();
  sheets.delete("second");
  await session.initialize();
  const replacement = sheetMetadata(
    "replacement",
    "env",
    "board:replacement",
    blankFlowBoard("Canvas 1"),
    3,
  );
  storage.remove.mockResolvedValueOnce([replacement]);
  expect(await session.remove("first")).toBe(true);
  expect(session.getSnapshot().activeId).toBe("replacement");
  expect(session.getSnapshot().sheets).toEqual([replacement]);
});
it("keeps an externally deleted editor visible for export instead of losing unsaved work", async () => {
  const { session, sheets } = fixture();
  await session.initialize();
  sheets.delete("first");
  await session.refresh();
  expect(session.getSnapshot().activeId).toBe("first");
  expect(session.getSnapshot().sheets.some((sheet) => sheet.id === "first")).toBe(true);
  expect(session.getSnapshot().error).toContain("deleted in another window");
});
