import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { createImageLibraryStore, imageLibraryStorageKey } from "../lib/imageLibrary";
import { usePrimaryEnvironmentId } from "../state/environments";

// Shared by the sidebar and gallery; identity follows the image API's primary environment.
const stores = new Map<string | null, ReturnType<typeof createImageLibraryStore>>();

export function useImageLibrary() {
  const environmentId = usePrimaryEnvironmentId();
  const store = useMemo(() => {
    let current = stores.get(environmentId);
    if (!current) {
      current = createImageLibraryStore(environmentId);
      stores.set(environmentId, current);
    }
    return current;
  }, [environmentId]);
  useEffect(() => {
    if (environmentId === null) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === imageLibraryStorageKey(environmentId)) {
        store.getState().refresh();
      }
    };
    store.getState().refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [environmentId, store]);
  return useStore(store);
}
