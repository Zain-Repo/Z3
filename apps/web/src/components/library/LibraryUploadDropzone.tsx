import { uploadChatLibraryFile } from "@t3tools/client-runtime/state/chat-library";
import type { PreparedConnection } from "@t3tools/client-runtime/connection";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUpIcon,
  CheckIcon,
  FileIcon,
  TriangleAlertIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { runtime } from "../../lib/runtime";
import { cn, randomUUID } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  LIBRARY_UPLOAD_BATCH_LIMIT,
  libraryFileValidationError,
  readLibraryFile,
} from "./uploadFiles";

type UploadState = "queued" | "reading" | "uploading" | "saved" | "error";
interface UploadEntry {
  readonly id: string;
  readonly file: File;
  readonly state: UploadState;
  readonly error?: string;
}
const LABELS: Record<UploadState, string> = {
  queued: "Waiting",
  reading: "Reading file…",
  uploading: "Uploading…",
  saved: "Saved to library",
  error: "Upload failed",
};

export function LibraryUploadDropzone({
  prepared,
  onUploaded,
}: {
  prepared: PreparedConnection;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);
  const reducedMotion = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const [entries, setEntries] = useState<ReadonlyArray<UploadEntry>>([]);
  const [busy, setBusy] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const saved = entries.filter((entry) => entry.state === "saved").length;

  useEffect(() => () => batchRef.current?.abort(), []);

  async function upload(batch: ReadonlyArray<UploadEntry>) {
    if (batchRef.current) return;
    const controller = new AbortController();
    batchRef.current = controller;
    setBusy(true);
    let uploaded = false;
    const update = (id: string, state: UploadState, error?: string) => {
      if (controller.signal.aborted) return;
      setEntries((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, state, ...(error ? { error } : {}) } : entry,
        ),
      );
    };
    try {
      for (const entry of batch) {
        if (controller.signal.aborted) break;
        const validationError = libraryFileValidationError(entry.file);
        if (validationError) {
          update(entry.id, "error", validationError);
          continue;
        }
        try {
          update(entry.id, "reading");
          const dataBase64 = await readLibraryFile(entry.file, controller.signal);
          update(entry.id, "uploading");
          await runtime.runPromise(
            uploadChatLibraryFile(prepared, {
              uploadId: entry.id,
              name: entry.file.name,
              mimeType: entry.file.type || "application/octet-stream",
              dataBase64,
            }),
            { signal: controller.signal },
          );
          if (controller.signal.aborted) break;
          update(entry.id, "saved");
          uploaded = true;
        } catch {
          update(
            entry.id,
            "error",
            "Couldn’t upload this file. Check your connection and try again.",
          );
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        batchRef.current = null;
        if (uploaded) onUploaded();
      }
    }
  }

  function addFiles(files: FileList) {
    if (batchRef.current) return;
    const selected = Array.from(files);
    if (selected.length === 0) return;
    if (selected.length > LIBRARY_UPLOAD_BATCH_LIMIT) {
      setSelectionError(`Choose up to ${LIBRARY_UPLOAD_BATCH_LIMIT} files at a time.`);
      return;
    }
    setSelectionError(null);
    const batch = selected.map((file) => ({
      id: randomUUID(),
      file,
      state: "queued" as const,
    }));
    setEntries(batch);
    void upload(batch);
  }

  return (
    <section className="mb-7" aria-label="Upload files to library">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          if (!event.dataTransfer.types.includes("Files") || busy) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = busy ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-xl border border-dashed px-5 py-6 transition-[background-color,border-color] duration-150 motion-reduce:transition-none sm:px-6",
          dragging ? "border-primary bg-primary/[0.08]" : "border-border bg-muted/15",
        )}
      >
        <motion.div
          animate={{ y: dragging && !reducedMotion ? -4 : 0 }}
          transition={{ duration: 0.15 }}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-xs"
        >
          <UploadCloudIcon
            aria-hidden="true"
            className={cn("size-6", dragging && "text-primary")}
            strokeWidth={1.5}
          />
        </motion.div>
        <div className="min-w-48 flex-1">
          <p className="text-sm font-medium">
            {dragging ? "Drop files to add them" : "Drop files into your library"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Images up to 10 MB · Other files up to 2 MB · Up to 10 at a time
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          <UploadCloudIcon />
          {busy ? "Uploading files…" : "Choose files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          tabIndex={-1}
          aria-label="Choose files to upload"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            if (event.currentTarget.files) addFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {selectionError ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {selectionError}
        </p>
      ) : null}
      <AnimatePresence initial={false}>
        {entries.length > 0 ? (
          <motion.div
            key="uploads"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
            className="mt-3 overflow-hidden rounded-xl border border-border"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <p role="status" className="text-xs text-muted-foreground">
                {saved} of {entries.length} files saved
                {busy ? " · Keep this page open while uploading" : ""}
              </p>
              {!busy ? (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Dismiss upload status"
                  onClick={() => setEntries([])}
                >
                  <XIcon />
                </Button>
              ) : null}
            </div>
            <div
              role="progressbar"
              aria-label="Files saved"
              aria-valuemin={0}
              aria-valuemax={entries.length}
              aria-valuenow={saved}
              className="h-0.5 overflow-hidden bg-muted"
            >
              <motion.div
                className="h-full origin-left bg-primary"
                initial={false}
                animate={{ scaleX: saved / entries.length }}
                transition={{ duration: reducedMotion ? 0 : 0.25, ease: "easeOut" }}
              />
            </div>
            <ul className="divide-y divide-border/60" aria-live="polite" aria-relevant="text">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
                    <AnimatePresence initial={false} mode="wait">
                      <motion.span
                        key={entry.state}
                        className={
                          entry.state === "error"
                            ? "text-destructive"
                            : entry.state === "saved"
                              ? "text-primary"
                              : ""
                        }
                        initial={{
                          opacity: 0,
                          scale: reducedMotion ? 1 : 0.25,
                          filter: reducedMotion ? "blur(0px)" : "blur(4px)",
                        }}
                        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                        exit={{
                          opacity: 0,
                          scale: reducedMotion ? 1 : 0.25,
                          filter: reducedMotion ? "blur(0px)" : "blur(4px)",
                        }}
                        transition={{
                          type: "spring",
                          duration: reducedMotion ? 0 : 0.3,
                          bounce: 0,
                        }}
                      >
                        {entry.state === "saved" ? (
                          <CheckIcon className="size-4" />
                        ) : entry.state === "error" ? (
                          <TriangleAlertIcon className="size-4" />
                        ) : entry.state === "uploading" ? (
                          <ArrowUpIcon className="size-4" />
                        ) : (
                          <FileIcon className="size-4" />
                        )}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" title={entry.file.name}>
                      {entry.file.name}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-xs",
                        entry.state === "error" ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {entry.state === "error" ? entry.error : LABELS[entry.state]}
                    </p>
                  </div>
                  {entry.state === "error" && !libraryFileValidationError(entry.file) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void upload([entry])}
                    >
                      Retry
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
