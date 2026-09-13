import { useEffect, useMemo, useSyncExternalStore } from "react";
import { flowSheetSession } from "./flowSheetSession";

export function useFlowSheets(environmentId: string) {
  const session = useMemo(() => flowSheetSession(environmentId), [environmentId]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    void session.initialize();
    const refresh = () => {
      if (document.visibilityState === "visible") void session.refresh();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [session]);
  return { session, state };
}
