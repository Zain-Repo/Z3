import { assert, describe, it } from "@effect/vitest";
import {
  createImageLibraryStore,
  decodeImageLibrary,
  imageLibraryStorageKey,
  matchesImageLibraryFilter,
} from "./imageLibrary";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("image library", () => {
  it("removes deleted generation metadata without disturbing other entries", () => {
    const storage = memoryStorage();
    const store = createImageLibraryStore("env", () => storage);
    const id = store.getState().createCollection("Keep collection");
    assert.ok(id);
    for (const generationId of ["deleted", "kept"]) {
      store.getState().toggleFavorite(generationId);
      store.getState().setGenerationCollection(generationId, id);
    }
    store.getState().removeGeneration("deleted");
    store.getState().removeGeneration("deleted");
    assert.deepEqual(store.getState().favoriteIds, ["kept"]);
    assert.deepEqual(store.getState().collections, [
      { id, name: "Keep collection", generationIds: ["kept"] },
    ]);
    assert.deepEqual(createImageLibraryStore("env", () => storage).getState().favoriteIds, [
      "kept",
    ]);
  });

  it("refreshes before interleaved edits and follows external collection deletion", () => {
    const storage = memoryStorage();
    const first = createImageLibraryStore("env", () => storage);
    const second = createImageLibraryStore("env", () => storage);
    first.getState().toggleFavorite("first");
    second.getState().toggleFavorite("second");
    const id = first.getState().createCollection("Shared");
    assert.ok(id);
    assert.isTrue(second.getState().renameCollection(id, "Renamed"));
    first.getState().refresh();
    assert.equal(first.getState().collections[0]?.name, "Renamed");
    first.getState().setFilter({ collectionId: id });
    second.getState().deleteCollection(id);
    first.getState().refresh();
    assert.equal(first.getState().filter, "all");
    assert.equal(second.getState().error, null);
    assert.deepEqual(createImageLibraryStore("env", () => storage).getState().favoriteIds, [
      "first",
      "second",
    ]);
  });
  it("rejects malformed, unsupported and oversized persistence", () => {
    for (const raw of [
      "not json",
      "null",
      "[]",
      JSON.stringify({ version: 2, collections: [], favoriteIds: [] }),
      JSON.stringify({ version: 1, collections: [], favoriteIds: [3] }),
      JSON.stringify({
        version: 1,
        collections: [{ id: "a", name: " ", generationIds: [] }],
        favoriteIds: [],
      }),
      "x".repeat(4_000_001),
    ]) {
      assert.equal(decodeImageLibrary(raw), null);
    }
    assert.deepEqual(decodeImageLibrary(null), { version: 1, collections: [], favoriteIds: [] });
  });

  it("keeps environments isolated and restores saved metadata", () => {
    const storage = memoryStorage();
    const first = createImageLibraryStore("one", () => storage);
    const second = createImageLibraryStore("two", () => storage);
    first.getState().toggleFavorite("generation");
    assert.deepEqual(second.getState().favoriteIds, []);
    assert.deepEqual(createImageLibraryStore("one", () => storage).getState().favoriteIds, [
      "generation",
    ]);
    assert.notEqual(imageLibraryStorageKey("a/b"), imageLibraryStorageKey("a%2Fb"));
  });

  it("supports favorites, collection moves, rename, unassign and deletion", () => {
    const storage = memoryStorage();
    const store = createImageLibraryStore("env", () => storage);
    const first = store.getState().createCollection(" First ");
    const second = store.getState().createCollection("Second");
    assert.ok(first);
    assert.ok(second);
    store.getState().toggleFavorite("generation");
    store.getState().setFilter("favorites");
    assert.isTrue(matchesImageLibraryFilter("generation", store.getState()));
    assert.isFalse(matchesImageLibraryFilter("other", store.getState()));
    store.getState().toggleFavorite("generation");
    assert.isFalse(matchesImageLibraryFilter("generation", store.getState()));
    store.getState().setGenerationCollection("generation", first);
    store.getState().setGenerationCollection("generation", second);
    assert.deepEqual(store.getState().collections[0]?.generationIds, []);
    store.getState().setFilter({ collectionId: second });
    assert.isTrue(matchesImageLibraryFilter("generation", store.getState()));
    assert.isTrue(store.getState().renameCollection(second, "Renamed"));
    assert.equal(store.getState().collections[1]?.name, "Renamed");
    store.getState().setGenerationCollection("generation", null);
    assert.isFalse(matchesImageLibraryFilter("generation", store.getState()));
    store.getState().setGenerationCollection("generation", second);
    store.getState().toggleFavorite("generation");
    assert.isTrue(store.getState().deleteCollection(second));
    assert.equal(store.getState().filter, "all");
    assert.isTrue(matchesImageLibraryFilter("generation", store.getState()));
    assert.deepEqual(store.getState().favoriteIds, ["generation"]);
    assert.equal(store.getState().collections.length, 1);
  });

  it("bounds collection input and rejects unknown targets", () => {
    const storage = memoryStorage();
    const store = createImageLibraryStore("env", () => storage);
    assert.equal(store.getState().createCollection(" "), null);
    assert.equal(store.getState().createCollection("x".repeat(65)), null);
    const id = store.getState().createCollection("Art");
    assert.ok(id);
    assert.equal(store.getState().createCollection(" art "), null);
    store.getState().setGenerationCollection("g", "missing");
    store.getState().setFilter({ collectionId: "missing" });
    assert.equal(store.getState().filter, "all");
    assert.deepEqual(store.getState().collections[0]?.generationIds, []);
  });

  it("preserves saved state when writes fail and permits retry", () => {
    const storage = memoryStorage();
    let fail = false;
    const store = createImageLibraryStore("env", () => ({
      ...storage,
      setItem: (key, value) => {
        if (fail) throw new Error("quota");
        storage.setItem(key, value);
      },
    }));
    const id = store.getState().createCollection("Original");
    assert.ok(id);
    store.getState().setFilter({ collectionId: id });
    fail = true;
    assert.isFalse(store.getState().renameCollection(id, "Changed"));
    assert.isFalse(store.getState().deleteCollection(id));
    store.getState().toggleFavorite("g");
    assert.deepEqual(store.getState().favoriteIds, []);
    assert.equal(store.getState().collections[0]?.name, "Original");
    assert.deepEqual(store.getState().filter, { collectionId: id });
    assert.ok(store.getState().error);
    fail = false;
    assert.isTrue(store.getState().renameCollection(id, "Changed"));
    assert.equal(store.getState().error, null);
  });

  it("never overwrites unreadable data or writes under an unknown environment", () => {
    const storage = memoryStorage();
    storage.values.set(imageLibraryStorageKey("env"), "broken");
    const store = createImageLibraryStore("env", () => storage);
    assert.isFalse(store.getState().ready);
    store.getState().toggleFavorite("g");
    assert.equal(storage.getItem(imageLibraryStorageKey("env")), "broken");
    const pending = createImageLibraryStore(null, () => storage);
    assert.isFalse(pending.getState().ready);
    pending.getState().toggleFavorite("g");
    assert.equal(storage.values.size, 1);
    const blocked = createImageLibraryStore("blocked", () => {
      throw new Error("blocked");
    });
    assert.isFalse(blocked.getState().ready);
    assert.ok(blocked.getState().error);
  });
});
