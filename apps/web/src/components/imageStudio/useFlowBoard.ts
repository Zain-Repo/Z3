import type { FlowSheet } from "./flowSheets";
import { loadFlowDocument, saveFlowDocument } from "./flowStorage";
import { useCallback, useEffect, useRef, useState } from "react";
import { blankFlowBoard, type FlowBoard } from "./flowModel";

export function useFlowBoard(sheet: FlowSheet, onSaved: () => void) {
  const key = sheet.boardKey;
  const [initial] = useState(() => ({ board: blankFlowBoard(sheet.title), error: "" }));
  const lastSaved = useRef<FlowBoard | null>(null);
  const [board, setBoard] = useState(initial.board);
  const current = useRef(board);
  const past = useRef<FlowBoard[]>([]);
  const future = useRef<FlowBoard[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [saveError, setSaveError] = useState(initial.error);
  const [saved, setSaved] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const revision = useRef<number | null>(null);
  const writes = useRef(Promise.resolve());
  const mounted = useRef(false);
  const restored = useRef(false);
  const lastEdit = useRef(0);
  const editable = useRef(!initial.error);

  const change = useCallback((update: (value: FlowBoard) => FlowBoard, history = true) => {
    const next = update(current.current);
    if (next === current.current) return;
    if (history) {
      if (Date.now() - lastEdit.current > 600)
        past.current = [...past.current.slice(-39), current.current];
      lastEdit.current = Date.now();
      future.current = [];
      setHistoryVersion((version) => version + 1);
    }
    current.current = next;
    setBoard(next);
    setSaved(false);
  }, []);

  const checkpoint = useCallback(() => {
    lastEdit.current = 0;
  }, []);
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(current.current);
    current.current = previous;
    setBoard(previous);
    setSaved(false);
    setHistoryVersion((version) => version + 1);
    lastEdit.current = 0;
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    current.current = next;
    setBoard(next);
    setSaved(false);
    setHistoryVersion((version) => version + 1);
    lastEdit.current = 0;
  }, []);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void loadFlowDocument(key)
      .then((document) => {
        if (!active) return;
        if (!document) throw new Error("Saved canvas is missing. Reload the canvas list.");
        if (document) {
          revision.current = document.revision;
          current.current = document.board;
          lastSaved.current = document.board;
          setBoard(document.board);
          setSaved(true);
          setSaveError("");
          editable.current = true;
        }
        restored.current = true;
        setRestoring(false);
      })
      .catch(() => {
        if (!active) return;
        editable.current = false;
        setRestoring(false);
        setSaveError(
          "Canvas storage could not load. Export a copy to keep your work; reload to retry.",
        );
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [key]);

  const persist = useCallback(() => {
    if (!editable.current || !restored.current) return;
    const snapshot = current.current;
    if (snapshot === lastSaved.current) return;
    writes.current = writes.current.then(async () => {
      if (!editable.current || snapshot === lastSaved.current) return;
      try {
        revision.current = await saveFlowDocument(key, snapshot, revision.current, {
          id: sheet.id,
          environmentId: sheet.environmentId,
          createdAt: sheet.createdAt,
        });
        lastSaved.current = snapshot;
        onSaved();
        if (mounted.current && current.current === snapshot) {
          setSaved(true);
          setSaveError("");
        }
      } catch (cause) {
        editable.current = false;
        if (mounted.current)
          setSaveError(
            `${cause instanceof Error ? cause.message : "Canvas could not be saved."} Export a copy to keep your work.`,
          );
      }
    });
  }, [key, onSaved, sheet.id, sheet.environmentId, sheet.createdAt]);

  const flush = useCallback(async () => {
    if (!restored.current || !editable.current)
      throw new Error(
        "Current canvas is not safely saved. Export it or resolve the storage error before switching.",
      );
    do {
      persist();
      await writes.current;
      if (!editable.current)
        throw new Error(
          "Canvas save failed. Your current sheet remains open; export a copy before retrying.",
        );
    } while (current.current !== lastSaved.current);
  }, [persist]);

  useEffect(() => {
    if (saved || restoring) return;
    const timer = window.setTimeout(persist, 500);
    return () => window.clearTimeout(timer);
  }, [board, persist, restoring, saved]);
  useEffect(() => {
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      persist();
    };
  }, [persist]);

  return {
    board,
    flush,
    current,
    change,
    checkpoint,
    undo,
    redo,
    canUndo: historyVersion >= 0 && past.current.length > 0,
    canRedo: future.current.length > 0,
    saved,
    restoring,
    saveError,
    replace: (next: FlowBoard) => {
      editable.current = restored.current;
      checkpoint();
      change(() => next);
    },
  };
}
