import { parseFlowBoard, type FlowBoard } from "./flowModel";

export type StoredFlowBoard = { readonly revision: number; readonly board: FlowBoard };

export function nextFlowRevision(current: number | null, expected: number | null): number {
  if (current !== expected)
    throw new Error(
      "This canvas changed in another tab. Export this copy, then reload the saved version.",
    );
  return (expected ?? 0) + 1;
}

function storedFlowRecord(value: unknown): { revision: number; board: unknown } | null {
  if (value === undefined) return null;
  if (
    !value ||
    typeof value !== "object" ||
    !("revision" in value) ||
    !("board" in value) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  )
    throw new Error("The saved canvas document is invalid.");
  return { revision: value.revision, board: value.board };
}

export function decodeStoredFlow(value: unknown): StoredFlowBoard | null {
  const record = storedFlowRecord(value);
  return record ? { revision: record.revision, board: parseFlowBoard(record.board) } : null;
}

export async function openFlowDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("zimage-canvas", 2);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains("boards"))
        request.result.createObjectStore("boards");
      if (!request.result.objectStoreNames.contains("sheets")) {
        const sheets = request.result.createObjectStore("sheets", { keyPath: "id" });
        sheets.createIndex("environmentId", "environmentId");
      }
    });
    let blocked = false;
    request.addEventListener("success", () => {
      if (blocked) request.result.close();
      else {
        request.result.addEventListener("versionchange", () => request.result.close());
        resolve(request.result);
      }
    });
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Canvas storage could not open.")),
    );
    request.addEventListener("blocked", () => {
      blocked = true;
      reject(new Error("Close older ZImage tabs to upgrade canvas storage."));
    });
  });
}

export async function loadFlowDocument(key: string): Promise<StoredFlowBoard | null> {
  const database = await openFlowDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("boards", "readonly");
      const request = transaction.objectStore("boards").get(key);
      request.addEventListener("success", () => {
        try {
          resolve(decodeStoredFlow(request.result as unknown));
        } catch (cause) {
          reject(cause);
        }
      });
      request.addEventListener("error", () => reject(request.error));
      transaction.addEventListener("abort", () =>
        reject(transaction.error ?? new Error("Canvas loading was interrupted.")),
      );
    });
  } finally {
    database.close();
  }
}

/** Compare and write in one transaction, so two tabs cannot silently overwrite each other. */
export async function saveFlowDocument(
  key: string,
  board: FlowBoard,
  expectedRevision: number | null,
  sheet?: { readonly id: string; readonly environmentId: string; readonly createdAt: number },
): Promise<number> {
  const database = await openFlowDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(
        sheet ? ["boards", "sheets"] : ["boards"],
        "readwrite",
      );
      const store = transaction.objectStore("boards");
      const request = store.get(key);
      const revision = (expectedRevision ?? 0) + 1;
      let error: unknown;
      request.addEventListener("success", () => {
        try {
          const saved = storedFlowRecord(request.result as unknown);
          store.put(
            { revision: nextFlowRevision(saved?.revision ?? null, expectedRevision), board },
            key,
          );
          if (sheet)
            transaction
              .objectStore("sheets")
              .put({
                ...sheet,
                boardKey: key,
                title: board.title,
                nodeCount: board.nodes.length,
                updatedAt: Date.now(),
              });
        } catch (cause) {
          error = cause;
          transaction.abort();
        }
      });
      transaction.addEventListener("complete", () => resolve(revision));
      transaction.addEventListener("abort", () =>
        reject(error ?? transaction.error ?? new Error("Canvas saving was interrupted.")),
      );
      transaction.addEventListener("error", () => {
        error ??= transaction.error;
      });
    });
  } finally {
    database.close();
  }
}
