import { createStore } from "zustand/vanilla";
import { randomUUID } from "./utils";

export interface ImageCollection {
  id: string;
  name: string;
  generationIds: string[];
}
export type ImageLibraryFilter = "all" | "favorites" | { collectionId: string };
export interface ImageLibraryData {
  version: 1;
  collections: ImageCollection[];
  favoriteIds: string[];
}
export const IMAGE_COLLECTION_NAME_LIMIT = 64;
const MAX_COLLECTIONS = 100;
const MAX_IDS = 10_000;
const MAX_STORAGE_LENGTH = 4_000_000;
const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;
const emptyData = (): ImageLibraryData => ({ version: 1, collections: [], favoriteIds: [] });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_IDS && value.every(validId);
}

/** Reject unsupported or malformed snapshots without overwriting the original storage. */
export function decodeImageLibrary(raw: string | null): ImageLibraryData | null {
  if (raw === null) return emptyData();
  if (raw.length > MAX_STORAGE_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !validIds(value.favoriteIds) ||
      !Array.isArray(value.collections) ||
      value.collections.length > MAX_COLLECTIONS
    )
      return null;
    const collections: ImageCollection[] = [];
    const collectionIds = new Set<string>();
    const assignedIds = new Set<string>();
    for (const collection of value.collections) {
      if (
        !isRecord(collection) ||
        !validId(collection.id) ||
        collectionIds.has(collection.id) ||
        typeof collection.name !== "string" ||
        !collection.name.trim() ||
        collection.name.length > IMAGE_COLLECTION_NAME_LIMIT ||
        !validIds(collection.generationIds)
      )
        return null;
      const generationIds = [...new Set(collection.generationIds)];
      if (generationIds.some((id) => assignedIds.has(id))) return null;
      generationIds.forEach((id) => assignedIds.add(id));
      collectionIds.add(collection.id);
      collections.push({ id: collection.id, name: collection.name.trim(), generationIds });
    }
    return { version: 1, collections, favoriteIds: [...new Set(value.favoriteIds)] };
  } catch {
    return null;
  }
}

export function imageLibraryStorageKey(environmentId: string): string {
  return `zimage:library:v1:${encodeURIComponent(environmentId)}`;
}

export interface ImageLibraryState extends ImageLibraryData {
  ready: boolean;
  filter: ImageLibraryFilter;
  error: string | null;
  setFilter: (filter: ImageLibraryFilter) => void;
  toggleFavorite: (generationId: string) => void;
  setGenerationCollection: (generationId: string, collectionId: string | null) => void;
  createCollection: (name: string) => string | null;
  renameCollection: (id: string, name: string) => boolean;
  deleteCollection: (id: string) => boolean;
  removeGeneration: (generationId: string) => void;
  refresh: () => boolean;
}

type LibraryStorage = Pick<Storage, "getItem" | "setItem">;

/** Each store owns one environment; failed writes preserve its last successfully saved state. */
export function createImageLibraryStore(
  environmentId: string | null,
  storage: () => LibraryStorage = () => window.localStorage,
) {
  let initial = emptyData();
  let error: string | null = null;
  let readable = environmentId !== null;
  let lastSavedRaw: string | null = null;
  if (environmentId !== null) {
    try {
      lastSavedRaw = storage().getItem(imageLibraryStorageKey(environmentId));
      const decoded = decodeImageLibrary(lastSavedRaw);
      if (decoded) initial = decoded;
      else {
        readable = false;
        error =
          "Saved library data could not be read. Reload after restoring this browser's library data.";
      }
    } catch {
      readable = false;
      error =
        "Browser storage is unavailable. Allow site storage, then reload to use collections and favorites.";
    }
  }
  return createStore<ImageLibraryState>((set, get) => {
    const refresh = (): boolean => {
      if (environmentId === null) return false;
      try {
        const raw = storage().getItem(imageLibraryStorageKey(environmentId));
        if (readable && raw === lastSavedRaw) return true;
        const decoded = decodeImageLibrary(raw);
        if (!decoded) {
          readable = false;
          set({
            ready: false,
            error:
              "Saved library data could not be read. Restore this browser's library data to continue.",
          });
          return false;
        }
        const filter = get().filter;
        lastSavedRaw = raw;
        readable = true;
        set({
          ...decoded,
          ready: true,
          error: null,
          filter:
            typeof filter === "object" &&
            !decoded.collections.some((item) => item.id === filter.collectionId)
              ? "all"
              : filter,
        });
        return true;
      } catch {
        set({ error: "Browser storage is unavailable. Allow site storage, then try again." });
        return false;
      }
    };
    const save = (next: ImageLibraryData): boolean => {
      if (!readable || environmentId === null) return false;
      try {
        if (storage().getItem(imageLibraryStorageKey(environmentId)) !== lastSavedRaw) {
          refresh();
          set({ error: "The library changed in another window. Try your change again." });
          return false;
        }
        const serialized = JSON.stringify(next);
        if (serialized.length > MAX_STORAGE_LENGTH) throw new Error("Library capacity exceeded");
        storage().setItem(imageLibraryStorageKey(environmentId), serialized);
        lastSavedRaw = serialized;
        set({ ...next, error: null });
        return true;
      } catch {
        set({ error: "Library changes could not be saved. Free browser storage and try again." });
        return false;
      }
    };
    const data = (): ImageLibraryData => ({
      version: 1,
      collections: get().collections,
      favoriteIds: get().favoriteIds,
    });
    const nameIsValid = (name: string, exceptId?: string) => {
      if (!name || name.length > IMAGE_COLLECTION_NAME_LIMIT) {
        set({
          error: `Use a collection name between 1 and ${IMAGE_COLLECTION_NAME_LIMIT} characters.`,
        });
        return false;
      }
      if (
        get().collections.some(
          (item) =>
            item.id !== exceptId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      ) {
        set({ error: "A collection with this name already exists." });
        return false;
      }
      return true;
    };
    return {
      ...initial,
      ready: readable,
      filter: "all",
      error,
      refresh,
      setFilter: (filter) => {
        refresh();
        if (
          typeof filter === "object" &&
          !get().collections.some((item) => item.id === filter.collectionId)
        )
          return;
        set({ filter });
      },
      toggleFavorite: (generationId) => {
        if (!refresh()) return;
        if (!validId(generationId)) return;
        const current = data();
        if (!current.favoriteIds.includes(generationId) && current.favoriteIds.length >= MAX_IDS) {
          set({
            error: "The favorites limit has been reached. Remove a favorite before adding another.",
          });
          return;
        }
        save({
          ...current,
          favoriteIds: current.favoriteIds.includes(generationId)
            ? current.favoriteIds.filter((id) => id !== generationId)
            : [...current.favoriteIds, generationId],
        });
      },
      setGenerationCollection: (generationId, collectionId) => {
        if (!refresh()) return;
        if (!validId(generationId)) return;
        const current = data();
        const target = current.collections.find((item) => item.id === collectionId);
        if (collectionId !== null && !target) return;
        if (
          target &&
          !target.generationIds.includes(generationId) &&
          target.generationIds.length >= MAX_IDS
        ) {
          set({ error: "This collection is full. Remove an item before adding another." });
          return;
        }
        save({
          ...current,
          collections: current.collections.map((item) => ({
            ...item,
            generationIds:
              item.id === collectionId
                ? [...new Set([...item.generationIds, generationId])]
                : item.generationIds.filter((id) => id !== generationId),
          })),
        });
      },
      createCollection: (input) => {
        if (!refresh()) return null;
        const name = input.trim();
        if (!nameIsValid(name)) return null;
        if (get().collections.length >= MAX_COLLECTIONS) {
          set({
            error:
              "The collection limit has been reached. Delete a collection before creating another.",
          });
          return null;
        }
        const id = randomUUID();
        return save({
          ...data(),
          collections: [...get().collections, { id, name, generationIds: [] }],
        })
          ? id
          : null;
      },
      renameCollection: (id, input) => {
        if (!refresh()) return false;
        const name = input.trim();
        if (!nameIsValid(name, id) || !get().collections.some((item) => item.id === id))
          return false;
        return save({
          ...data(),
          collections: get().collections.map((item) => (item.id === id ? { ...item, name } : item)),
        });
      },
      deleteCollection: (id) => {
        if (!refresh()) return false;
        if (!get().collections.some((item) => item.id === id)) return false;
        const filter = get().filter;
        const saved = save({
          ...data(),
          collections: get().collections.filter((item) => item.id !== id),
        });
        if (saved && typeof filter === "object" && filter.collectionId === id)
          set({ filter: "all" });
        return saved;
      },
      removeGeneration: (generationId) => {
        if (!refresh()) return;
        const current = data();
        if (
          !current.favoriteIds.includes(generationId) &&
          !current.collections.some((item) => item.generationIds.includes(generationId))
        )
          return;
        save({
          ...current,
          favoriteIds: current.favoriteIds.filter((id) => id !== generationId),
          collections: current.collections.map((item) => ({
            ...item,
            generationIds: item.generationIds.filter((id) => id !== generationId),
          })),
        });
      },
    };
  });
}

export function matchesImageLibraryFilter(
  generationId: string,
  library: Pick<ImageLibraryState, "filter" | "collections" | "favoriteIds">,
): boolean {
  if (library.filter === "all") return true;
  if (library.filter === "favorites") return library.favoriteIds.includes(generationId);
  const collectionId = library.filter.collectionId;
  return (
    library.collections
      .find((item) => item.id === collectionId)
      ?.generationIds.includes(generationId) ?? false
  );
}
