import { FileTextIcon, PaperclipIcon, SaveIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAtomCommand } from "../state/use-atom-command";
import { useClientSettings } from "../hooks/useSettings";

import {
  CHAT_PROJECT_SOURCE_MAX_BYTES,
  DEFAULT_CHAT_PROJECT_MEMORY_MODE,
  isSupportedChatProjectSource,
  type ChatProject,
  type ChatProjectMemoryMode,
  useChatProjectsStore,
} from "../lib/chatProjects";
import type { EnvironmentId } from "@t3tools/contracts";
import { serverEnvironment } from "../state/server";
import { toastManager } from "./ui/toast";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";

interface ChatProjectDialogProps {
  readonly environmentId: EnvironmentId;
  readonly onCreated: (projectId: string) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly project: ChatProject | null;
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

export function ChatProjectDialog({
  environmentId,
  onCreated,
  onOpenChange,
  open,
  project,
}: ChatProjectDialogProps) {
  const createProject = useChatProjectsStore((state) => state.createProject);
  const updateProject = useChatProjectsStore((state) => state.updateProject);
  const addSource = useChatProjectsStore((state) => state.addSource);
  const updateSource = useChatProjectsStore((state) => state.updateSource);
  const removeSource = useChatProjectsStore((state) => state.removeSource);
  const embeddingModel = useClientSettings((settings) => settings.z3chatEmbeddingModel);
  const uploadSource = useAtomCommand(serverEnvironment.uploadZ3ChatProjectSource, {
    reportFailure: false,
  });
  const deleteRemoteSource = useAtomCommand(serverEnvironment.deleteZ3ChatProjectSource, {
    reportFailure: false,
  });
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [memoryMode, setMemoryMode] = useState<ChatProjectMemoryMode>(
    DEFAULT_CHAT_PROJECT_MEMORY_MODE,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setInstructions(project?.instructions ?? "");
    setMemoryMode(project?.memoryMode ?? DEFAULT_CHAT_PROJECT_MEMORY_MODE);
  }, [open, project?.id]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toastManager.add({ type: "warning", title: "Project name cannot be empty" });
      return;
    }
    if (project) {
      updateProject(environmentId, project.id, {
        name: trimmedName,
        instructions,
        memoryMode,
      });
      toastManager.add({ type: "success", title: "Project saved" });
      onOpenChange(false);
      return;
    }
    const projectId = createProject(environmentId, trimmedName);
    if (!projectId) {
      toastManager.add({ type: "error", title: "Could not create project" });
      return;
    }
    updateProject(environmentId, projectId, { instructions, memoryMode });
    onCreated(projectId);
    onOpenChange(false);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!project || !files) return;
    for (const file of files) {
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
        const sourceId = addSource(environmentId, project.id, {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          contents,
          contentBase64,
          indexStatus: "in_progress",
        });
        if (sourceId) {
          try {
            const result = await uploadSource({
              environmentId,
              input: {
                projectId: project.id,
                sourceId,
                projectName: project.name,
                fileName: file.name,
                mimeType: file.type || "application/octet-stream",
                contentBase64,
                embeddingModel,
              },
            });
            if (result._tag === "Success") {
              updateSource(environmentId, project.id, sourceId, {
                embeddingModel: result.value.embeddingModel,
                embeddingDimensions: result.value.embeddingDimensions,
                embeddingChunkCount: result.value.chunkCount,
                indexedAt: result.value.indexedAt,
                indexStatus: result.value.status,
              });
            } else {
              updateSource(environmentId, project.id, sourceId, { indexStatus: "failed" });
              toastManager.add({
                type: "warning",
                title: `Could not index ${file.name}`,
                description:
                  "The source remains available locally. Configure OpenRouter and re-index it later.",
              });
            }
          } catch {
            updateSource(environmentId, project.id, sourceId, { indexStatus: "failed" });
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveSource = async (source: ChatProject["sources"][number]) => {
    if (!project) return;
    const result = await deleteRemoteSource({
      environmentId,
      input: { projectId: project.id, sourceId: source.id },
    });
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: `Could not delete ${source.name}`,
        description: "The local source was kept because server index deletion did not complete.",
      });
      return;
    }
    removeSource(environmentId, project.id, source.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{project ? "Project settings" : "New project"}</DialogTitle>
          <DialogDescription>
            Give Z3Chat a reusable workspace with instructions and reference sources.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <label className="grid gap-1.5 text-sm font-medium">
            Project name
            <Input
              nativeInput
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="e.g. Product launch"
              autoFocus
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Custom instructions
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.currentTarget.value)}
              placeholder="Tell the model how to work in this project…"
              className="min-h-28"
            />
            <span className="text-xs font-normal text-muted-foreground">
              These instructions are included in every chat created in this project.
            </span>
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            Conversation memory
            <Select
              value={memoryMode}
              onValueChange={(value: string | null) => {
                if (value === "full" || value === "project-only") {
                  setMemoryMode(value);
                }
              }}
            >
              <SelectTrigger aria-label="Conversation memory">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="full">Full memory</SelectItem>
                <SelectItem value="project-only">Project Only</SelectItem>
              </SelectPopup>
            </Select>
            <span className="text-xs font-normal text-muted-foreground">
              {memoryMode === "full"
                ? "Searches relevant conversations across all Z3Chat projects."
                : "Searches relevant conversations from this project only."}
            </span>
          </label>

          {project ? (
            <section className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Sources</h3>
                  <p className="text-xs text-muted-foreground">
                    Text and code files are added as reference context.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon />
                  Add files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => void handleFiles(event.currentTarget.files)}
                />
              </div>
              {project.sources.length > 0 ? (
                <div className="divide-y rounded-lg border border-border/70">
                  {project.sources.map((source) => (
                    <div key={source.id} className="flex items-center gap-2 px-3 py-2">
                      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm" title={source.name}>
                        {source.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(source.sizeBytes)}
                      </span>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove ${source.name}`}
                        onClick={() => void handleRemoveSource(source)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
                  <PaperclipIcon className="mx-auto mb-1 size-4" />
                  No sources added yet
                </div>
              )}
            </section>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            <SaveIcon />
            {project ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
