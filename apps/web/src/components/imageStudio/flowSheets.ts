import * as Schema from "effect/Schema";
import { blankFlowBoard, parseFlowBoard, type FlowBoard } from "./flowModel";
import { decodeStoredFlow, openFlowDatabase, type StoredFlowBoard } from "./flowStorage";
import { randomUUID } from "../../lib/utils";

const Sheet = Schema.Struct({
  id: Schema.String,
  environmentId: Schema.String,
  boardKey: Schema.String,
  title: Schema.String,
  nodeCount: Schema.Int,
  createdAt: Schema.Finite,
  updatedAt: Schema.Finite,
});
export type FlowSheet = typeof Sheet.Type;
const decodeSheets = Schema.decodeUnknownSync(Schema.Array(Sheet));

export function sheetMetadata(
  id: string,
  environmentId: string,
  boardKey: string,
  board: FlowBoard,
  time: number,
): FlowSheet {
  return {
    id,
    environmentId,
    boardKey,
    title: board.title,
    nodeCount: board.nodes.length,
    createdAt: time,
    updatedAt: time,
  };
}

export function sortedFlowSheets(sheets: readonly FlowSheet[]): FlowSheet[] {
  return [...sheets].sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));
}

export function initialFlowSheet(
  environmentId: string,
  saved: StoredFlowBoard | null,
  local: string | null,
  time: number,
) {
  const board =
    saved?.board ??
    (local ? parseFlowBoard(JSON.parse(local) as unknown) : blankFlowBoard("Canvas 1"));
  const id = `initial:${environmentId}`;
  const boardKey = saved ? `zimage.flow.v1:${environmentId}` : `zimage.sheet.v1:${id}`;
  return { board, sheet: sheetMetadata(id, environmentId, boardKey, board, time) };
}

export async function listFlowSheets(environmentId: string): Promise<FlowSheet[]> {
  const database = await openFlowDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction("sheets", "readonly")
        .objectStore("sheets")
        .index("environmentId")
        .getAll(environmentId);
      request.addEventListener("success", () => {
        try {
          resolve(sortedFlowSheets(decodeSheets(request.result as unknown)));
        } catch (cause) {
          reject(cause);
        }
      });
      request.addEventListener("error", () => reject(request.error));
    });
  } finally {
    database.close();
  }
}

/** The first metadata entry and its board are committed atomically; concurrent tabs reuse it. */
export async function initializeFlowSheets(environmentId: string): Promise<void> {
  const database = await openFlowDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["boards", "sheets"], "readwrite");
      const sheets = transaction.objectStore("sheets");
      const boards = transaction.objectStore("boards");
      let error: unknown;
      const existing = sheets.index("environmentId").count(environmentId);
      existing.addEventListener("success", () => {
        if (existing.result > 0) return;
        const legacyKey = `zimage.flow.v1:${environmentId}`;
        const legacy = boards.get(legacyKey);
        legacy.addEventListener("success", () => {
          try {
            const saved = decodeStoredFlow(legacy.result as unknown);
            const local = saved ? null : localStorage.getItem(legacyKey);
            const initial = initialFlowSheet(environmentId, saved, local, Date.now());
            if (!saved) boards.put({ revision: 1, board: initial.board }, initial.sheet.boardKey);
            sheets.put(initial.sheet);
          } catch (cause) {
            error = cause;
            transaction.abort();
          }
        });
      });
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("abort", () =>
        reject(error ?? transaction.error ?? new Error("Previous canvas could not be restored.")),
      );
    });
  } finally {
    database.close();
  }
}

export async function createFlowSheet(environmentId: string, title: string): Promise<FlowSheet> {
  const id = randomUUID();
  const board = blankFlowBoard(title);
  const metadata = sheetMetadata(id, environmentId, `zimage.sheet.v1:${id}`, board, Date.now());
  const database = await openFlowDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["boards", "sheets"], "readwrite");
      transaction.objectStore("boards").add({ revision: 1, board }, metadata.boardKey);
      transaction.objectStore("sheets").add(metadata);
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("abort", () =>
        reject(transaction.error ?? new Error("New canvas could not be saved.")),
      );
    });
    return metadata;
  } finally {
    database.close();
  }
}

/** Delete the board and metadata together, retaining a blank sheet when deleting the last one. */
export async function deleteFlowSheet(environmentId: string, id: string): Promise<FlowSheet[]> {
  const database = await openFlowDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(["boards", "sheets"], "readwrite");
      const sheets = transaction.objectStore("sheets");
      const boards = transaction.objectStore("boards");
      const request = sheets.index("environmentId").getAll(environmentId);
      let remaining: FlowSheet[] = [];
      let error: unknown;
      request.addEventListener("success", () => {
        try {
          const current = decodeSheets(request.result as unknown);
          const target = current.find((sheet) => sheet.id === id);
          if (!target)
            throw new Error("This canvas has already been deleted. Refresh the canvas list.");
          remaining = current.filter((sheet) => sheet.id !== id);
          sheets.delete(id);
          boards.delete(target.boardKey);
          if (!remaining.length) {
            const replacementId = randomUUID();
            const board = blankFlowBoard("Canvas 1");
            const replacement = sheetMetadata(
              replacementId,
              environmentId,
              `zimage.sheet.v1:${replacementId}`,
              board,
              Date.now(),
            );
            boards.add({ revision: 1, board }, replacement.boardKey);
            sheets.add(replacement);
            remaining.push(replacement);
          }
        } catch (cause) {
          error = cause;
          transaction.abort();
        }
      });
      transaction.addEventListener("complete", () => resolve(sortedFlowSheets(remaining)));
      transaction.addEventListener("abort", () =>
        reject(error ?? transaction.error ?? new Error("Canvas could not be deleted.")),
      );
    });
  } finally {
    database.close();
  }
}
