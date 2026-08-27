import type { EnvironmentId } from "@t3tools/contracts";
import { useAtomCommand } from "../state/use-atom-command";
import { serverEnvironment } from "../state/server";
import { LoaderCircleIcon, UploadCloudIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useClientSettings } from "../hooks/useSettings";

import {
  CHAT_PROJECT_SOURCE_MAX_BYTES,
  isSupportedChatProjectSource,
  useChatProjectsStore,
} from "../lib/chatProjects";
import { cn } from "../lib/utils";
import { toastManager } from "./ui/toast";

interface ChatProjectSourceDropzoneProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function encodeBase64(bytes: ArrayBuffer): string {
  const values = new Uint8Array(bytes);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    binary += String.fromCharCode(...values.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function ChatProjectSourceDropzone({
  environmentId,
  projectId,
}: ChatProjectSourceDropzoneProps) {
  const addSource = useChatProjectsStore((state) => state.addSource);
  const updateSource = useChatProjectsStore((state) => state.updateSource);
  const projectName = useChatProjectsStore(
    (state) =>
      state.projectsByEnvironment[environmentId]?.find((project) => project.id === projectId)
        ?.name ?? projectId,
  );
  const embeddingModel = useClientSettings((settings) => settings.z3chatEmbeddingModel);
  const uploadSource = useAtomCommand(serverEnvironment.uploadZ3ChatProjectSource, {
    reportFailure: false,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const addFiles = async (files: FileList | readonly File[]) => {
    if (uploadInFlightRef.current) return;
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;

    uploadInFlightRef.current = true;
    setIsReading(true);
    setStatusMessage("");
    let addedCount = 0;

    try {
      for (const file of selectedFiles) {
        if (!isSupportedChatProjectSource(file)) {
          toastManager.add({
            type: "warning",
            title: `Unsupported source: ${file.name}`,
            description: `Use a file up to ${formatBytes(CHAT_PROJECT_SOURCE_MAX_BYTES)}.`,
          });
          continue;
        }

        try {
          const [contents, contentBytes] = await Promise.all([file.text(), file.arrayBuffer()]);
          const contentBase64 = encodeBase64(contentBytes);
          const sourceId = addSource(environmentId, projectId, {
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            contents,
            contentBase64,
            indexStatus: "in_progress",
          });
          if (sourceId) {
            addedCount += 1;
            try {
              const result = await uploadSource({
                environmentId,
                input: {
                  projectId,
                  sourceId,
                  projectName,
                  fileName: file.name,
                  mimeType: file.type || "application/octet-stream",
                  contentBase64,
                  embeddingModel,
                },
              });
              if (result._tag === "Success") {
                updateSource(environmentId, projectId, sourceId, {
                  embeddingModel: result.value.embeddingModel,
                  embeddingDimensions: result.value.embeddingDimensions,
                  embeddingChunkCount: result.value.chunkCount,
                  indexedAt: result.value.indexedAt,
                  indexStatus: result.value.status,
                });
              } else {
                updateSource(environmentId, projectId, sourceId, { indexStatus: "failed" });
                toastManager.add({
                  type: "warning",
                  title: `Could not index ${file.name}`,
                  description:
                    "The source remains available locally. Configure OpenRouter and re-index it later.",
                });
              }
            } catch {
              updateSource(environmentId, projectId, sourceId, { indexStatus: "failed" });
              toastManager.add({
                type: "warning",
                title: `Could not index ${file.name}`,
                description: "The source remains available locally. Try re-indexing it later.",
              });
            }
          } else {
            toastManager.add({
              type: "warning",
              title: `Could not add ${file.name}`,
              description: "The project may have reached its source or storage limit.",
            });
          }
        } catch {
          toastManager.add({ type: "error", title: `Could not read ${file.name}` });
        }
      }
    } finally {
      uploadInFlightRef.current = false;
      setIsReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }

    if (addedCount > 0) {
      const message = `${addedCount} source${addedCount === 1 ? "" : "s"} added`;
      setStatusMessage(message);
      toastManager.add({ type: "success", title: message });
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        disabled={isReading}
        onChange={(event) => {
          if (event.currentTarget.files) void addFiles(event.currentTarget.files);
        }}
      />
      <button
        type="button"
        disabled={isReading}
        className={cn(
          "flex min-h-24 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/80 bg-muted/15 px-4 py-3 text-center outline-none transition-[border-color,background-color,color]",
          "hover:border-primary/50 hover:bg-primary/[0.035] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          isDragging && "border-primary bg-primary/[0.07] text-foreground",
          isReading && "cursor-wait opacity-70",
        )}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!isReading) setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (!isReading) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            setIsDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void addFiles(event.dataTransfer.files);
        }}
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
          {isReading ? (
            <LoaderCircleIcon
              className="size-4.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <UploadCloudIcon className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
          )}
        </span>
        <span className="text-sm font-medium text-foreground/90">
          {isReading
            ? "Adding sources…"
            : isDragging
              ? "Drop files to attach"
              : "Drop files here or browse"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          Any file type up to {formatBytes(CHAT_PROJECT_SOURCE_MAX_BYTES)} each
        </span>
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>
    </div>
  );
}
