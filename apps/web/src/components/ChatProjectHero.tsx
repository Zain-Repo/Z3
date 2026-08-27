import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  AlertCircleIcon,
  FilesIcon,
  FileTextIcon,
  FolderIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PinIcon,
  PinOffIcon,
  RefreshCwIcon,
  Settings2Icon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import type { ThreadShell } from "../types";
import type { ChatProject, ChatProjectSource } from "../lib/chatProjects";
import { useChatProjectsStore } from "../lib/chatProjects";
import { ChatProjectDialog } from "./ChatProjectDialog";
import { ChatProjectSourceDropzone } from "./ChatProjectSourceDropzone";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/menu";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsList, TabsPanel, TabsTab } from "./ui/tabs";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const PROJECT_CONTENT_VISIBLE_ROW_COUNT = 5;
const PROJECT_CONTENT_ROW_HEIGHT_REM = 3;

interface ChatProjectHeroProps {
  readonly environmentId: EnvironmentId;
  readonly project: ChatProject;
  readonly onTogglePin: () => void;
}

export interface ChatProjectSourceActionHandlers {
  /** Rebuild the index entry for a source and reject when the operation fails. */
  readonly onReindexSource?: (source: ChatProjectSource) => void | Promise<void>;
  /** Remove a source and reject when the operation fails. */
  readonly onDeleteSource?: (source: ChatProjectSource) => void | Promise<void>;
}

interface ChatProjectContentTabsProps extends ChatProjectSourceActionHandlers {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly recentThreads: readonly ThreadShell[];
  readonly sources: readonly ChatProjectSource[];
  readonly onSelectThread: (environmentId: EnvironmentId, threadId: ThreadId) => void;
}

type ChatProjectSourceAction = "reindex" | "delete";

interface PendingSourceAction {
  readonly sourceId: string;
  readonly action: ChatProjectSourceAction;
}

function formatRecentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatProjectHero({ environmentId, project, onTogglePin }: ChatProjectHeroProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isReducedMotion = useReducedMotion() ?? false;

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-1 sm:px-2">
        <div className="flex items-center justify-between gap-4 px-1 sm:px-2">
          <motion.div
            className="flex min-w-0 items-center gap-3"
            initial={isReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={isReducedMotion ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
          >
            <FolderIcon className="size-7 shrink-0 text-foreground/80" strokeWidth={1.8} />
            <h1 className="min-w-0 truncate text-2xl font-medium tracking-tight text-foreground sm:text-[28px]">
              {project.name}
            </h1>
          </motion.div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/65 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Actions for ${project.name}`}
            >
              <MoreHorizontalIcon className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings2Icon />
                Project settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onTogglePin}>
                {project.isPinned ? <PinOffIcon /> : <PinIcon />}
                {project.isPinned ? "Unpin project" : "Pin project"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ChatProjectDialog
        environmentId={environmentId}
        onCreated={() => undefined}
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        project={project}
      />
    </>
  );
}

export function ChatProjectContentTabs({
  environmentId,
  projectId,
  recentThreads,
  sources,
  onSelectThread,
  onReindexSource,
  onDeleteSource,
}: ChatProjectContentTabsProps) {
  const [pendingSourceAction, setPendingSourceAction] = useState<PendingSourceAction | null>(null);
  const [sourceActionErrors, setSourceActionErrors] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const sourceUploadProgress = useChatProjectsStore((state) => state.sourceUploadProgress);
  const contentMaxHeight = `${PROJECT_CONTENT_VISIBLE_ROW_COUNT * PROJECT_CONTENT_ROW_HEIGHT_REM}rem`;

  const handleSourceAction = async (
    source: ChatProjectSource,
    action: ChatProjectSourceAction,
  ): Promise<void> => {
    const callback = action === "reindex" ? onReindexSource : onDeleteSource;
    if (!callback || pendingSourceAction) return;

    setPendingSourceAction({ action, sourceId: source.id });
    setSourceActionErrors((current) => {
      if (!(source.id in current)) return current;
      const next = { ...current };
      delete next[source.id];
      return next;
    });

    try {
      await callback(source);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : typeof error === "string" && error.length > 0
            ? error
            : "Please try again.";
      setSourceActionErrors((current) => ({ ...current, [source.id]: message }));
    } finally {
      setPendingSourceAction(null);
    }
  };

  return (
    <section className="mx-auto mt-5 w-full max-w-3xl px-2" aria-label="Project content">
      <Tabs defaultValue="recent" className="gap-0">
        <div className="border-b border-border/70">
          <TabsList variant="underline" size="sm" aria-label="Project content views">
            <TabsTab value="recent" className="gap-1.5 px-2.5 text-xs">
              <MessageSquareTextIcon aria-hidden="true" />
              Recent chats
              <span className="tabular-nums text-[10px] text-muted-foreground/65">
                {recentThreads.length}
              </span>
            </TabsTab>
            <TabsTab value="sources" className="gap-1.5 px-2.5 text-xs">
              <FilesIcon aria-hidden="true" />
              Sources
              <span className="tabular-nums text-[10px] text-muted-foreground/65">
                {sources.length}
              </span>
            </TabsTab>
          </TabsList>
        </div>
        <TabsPanel value="recent">
          {recentThreads.length > 0 ? (
            <ScrollArea
              className="border-b border-border/70"
              style={{ maxHeight: contentMaxHeight }}
            >
              <div className="divide-y divide-border/70">
                {recentThreads.map((thread) => (
                  <button
                    key={`${environmentId}:${thread.id}`}
                    type="button"
                    className="flex h-12 w-full items-center gap-3 px-1 text-left outline-none transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-2"
                    onClick={() => onSelectThread(environmentId, thread.id)}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
                      {thread.title || "New chat"}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatRecentDate(thread.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex h-24 items-center justify-center border-b border-border/70 px-4 text-center text-xs text-muted-foreground">
              No chats in this project yet.
            </div>
          )}
        </TabsPanel>
        <TabsPanel value="sources">
          <div className="border-b border-border/70 p-2">
            <ChatProjectSourceDropzone environmentId={environmentId} projectId={projectId} />
          </div>
          {sources.length > 0 ? (
            <ScrollArea
              className="border-b border-border/70"
              style={{ maxHeight: contentMaxHeight }}
            >
              <div className="divide-y divide-border/70">
                {sources.map((source) => {
                  const uploadProgress = sourceUploadProgress[source.id];
                  return (
                    <div key={source.id} className="min-w-0">
                      <div
                        className="group flex min-h-12 min-w-0 items-center gap-3 px-1 py-1 sm:px-2"
                        aria-busy={pendingSourceAction?.sourceId === source.id}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/55 text-muted-foreground">
                          <FileTextIcon className="size-4" strokeWidth={1.7} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate text-sm text-foreground/90"
                            title={source.name}
                          >
                            {source.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {formatBytes(source.sizeBytes)} · Added{" "}
                            {formatRecentDate(source.createdAt)}
                          </span>
                          {sourceActionErrors[source.id] ? (
                            <span
                              id={`chat-project-source-error-${source.id}`}
                              className="flex min-w-0 items-center gap-1 break-words text-[11px] text-destructive"
                              role="alert"
                            >
                              <AlertCircleIcon className="size-3 shrink-0" aria-hidden="true" />
                              <span>{sourceActionErrors[source.id]}</span>
                            </span>
                          ) : null}
                        </span>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={
                                    pendingSourceAction?.sourceId === source.id &&
                                    pendingSourceAction.action === "reindex"
                                      ? "Re-indexing source…"
                                      : onReindexSource
                                        ? "Re-index source"
                                        : "Re-index source unavailable"
                                  }
                                  title={
                                    onReindexSource
                                      ? "Re-index source"
                                      : "Re-index source unavailable"
                                  }
                                  disabled={Boolean(pendingSourceAction) || !onReindexSource}
                                  aria-describedby={
                                    sourceActionErrors[source.id]
                                      ? `chat-project-source-error-${source.id}`
                                      : undefined
                                  }
                                  onClick={() => void handleSourceAction(source, "reindex")}
                                >
                                  {pendingSourceAction?.sourceId === source.id &&
                                  pendingSourceAction.action === "reindex" ? (
                                    <LoaderCircleIcon
                                      className="animate-spin motion-reduce:animate-none"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <RefreshCwIcon aria-hidden="true" />
                                  )}
                                </Button>
                              }
                            />
                            <TooltipPopup side="top">
                              {pendingSourceAction?.sourceId === source.id &&
                              pendingSourceAction.action === "reindex"
                                ? "Re-indexing source…"
                                : onReindexSource
                                  ? "Re-index source"
                                  : "Re-index source unavailable"}
                            </TooltipPopup>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-destructive hover:text-destructive"
                                  aria-label={
                                    pendingSourceAction?.sourceId === source.id &&
                                    pendingSourceAction.action === "delete"
                                      ? "Deleting source…"
                                      : onDeleteSource
                                        ? "Delete source"
                                        : "Delete source unavailable"
                                  }
                                  title={
                                    onDeleteSource ? "Delete source" : "Delete source unavailable"
                                  }
                                  disabled={Boolean(pendingSourceAction) || !onDeleteSource}
                                  aria-describedby={
                                    sourceActionErrors[source.id]
                                      ? `chat-project-source-error-${source.id}`
                                      : undefined
                                  }
                                  onClick={() => void handleSourceAction(source, "delete")}
                                >
                                  {pendingSourceAction?.sourceId === source.id &&
                                  pendingSourceAction.action === "delete" ? (
                                    <LoaderCircleIcon
                                      className="animate-spin motion-reduce:animate-none"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Trash2Icon aria-hidden="true" />
                                  )}
                                </Button>
                              }
                            />
                            <TooltipPopup side="top">
                              {pendingSourceAction?.sourceId === source.id &&
                              pendingSourceAction.action === "delete"
                                ? "Deleting source…"
                                : onDeleteSource
                                  ? "Delete source"
                                  : "Delete source unavailable"}
                            </TooltipPopup>
                          </Tooltip>
                        </div>
                        {uploadProgress !== undefined ? (
                          <div
                            className="px-1 pb-1.5 sm:px-2"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(uploadProgress)}
                            aria-label={`Uploading ${source.name}`}
                          >
                            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
                                style={{
                                  width: `${Math.min(100, Math.max(0, uploadProgress))}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : null}
        </TabsPanel>
      </Tabs>
    </section>
  );
}
