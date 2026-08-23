import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import {
  ArchiveIcon,
  FolderIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Trash2Icon,
  SearchIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "@tanstack/react-router";

import { isElectron } from "../env";
import { isAtomCommandInterrupted, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { cn } from "../lib/utils";
import {
  findDuplicateEmptyChatThreadIds,
  readChatEnvironmentSelection,
  resolveChatEnvironmentId,
  writeChatEnvironmentSelection,
} from "../lib/chatThreadCreation";
import { resolveChatSidebarProviderPresentation } from "../lib/chatSidebarProviderPresentation";
import {
  chatSidebarPinKey,
  readChatSidebarPins,
  setChatSidebarPin,
} from "../lib/chatSidebarPins";
import { resolveThreadRouteTarget } from "../threadRoutes";
import {
  type ChatProject,
  useChatProjectsStore,
} from "../lib/chatProjects";
import { useAtomCommand } from "../state/use-atom-command";
import { threadEnvironment } from "../state/threads";
import { useThreadActions } from "../hooks/useThreadActions";
import {
  setActiveEnvironmentId,
  useActiveEnvironmentId,
  useServerConfigs,
  useThreadShells,
} from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { sortThreadsForSidebarV2 } from "./Sidebar.logic";
import { SidebarChromeFooter, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/menu";
import { toastManager } from "./ui/toast";
import type { ThreadShell } from "../types";
import { ChatProjectDialog } from "./ChatProjectDialog";

const CHAT_THREAD_LIMIT = 40;
const EMPTY_CHAT_PROJECTS: readonly ChatProject[] = [];

function sidebarPinKeyForThread(thread: Pick<ThreadShell, "environmentId" | "id">): string {
  return chatSidebarPinKey({ environmentId: thread.environmentId, threadId: thread.id });
}

function sidebarPinRefForThread(thread: Pick<ThreadShell, "environmentId" | "id">) {
  return { environmentId: thread.environmentId, threadId: thread.id };
}

interface ChatSidebarThreadRowProps {
  readonly isActive: boolean;
  readonly isPinned: boolean;
  readonly isRenaming: boolean;
  readonly providerLabel: string | null;
  readonly navigateToThread: (environmentId: EnvironmentId, threadId: ThreadId) => void;
  readonly onArchive: (thread: ThreadShell) => Promise<void>;
  readonly onCancelRename: () => void;
  readonly onCommitRename: (thread: ThreadShell) => void;
  readonly onDelete: (thread: ThreadShell) => Promise<void>;
  readonly onRenameTitleChange: (title: string) => void;
  readonly onStartRename: (thread: ThreadShell) => void;
  readonly onTogglePin: (thread: ThreadShell) => void;
  readonly renamingTitle: string;
  readonly thread: ThreadShell;
}

function ChatSidebarThreadRow({
  isActive,
  isPinned,
  isRenaming,
  providerLabel,
  navigateToThread,
  onArchive,
  onCancelRename,
  onCommitRename,
  onDelete,
  onRenameTitleChange,
  onStartRename,
  onTogglePin,
  renamingTitle,
  thread,
}: ChatSidebarThreadRowProps) {
  const title = thread.title || "New chat";

  return (
    <SidebarMenuItem
      className="flex items-center gap-1"
    >
      {isRenaming ? (
        <Input
          nativeInput
          autoFocus
          value={renamingTitle}
          aria-label={`Rename ${title}`}
          className="h-8 min-w-0 flex-1 text-sm"
          onChange={(event) => onRenameTitleChange(event.currentTarget.value)}
          onBlur={() => onCommitRename(thread)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancelRename();
            } else if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <SidebarMenuButton
          type="button"
          isActive={isActive}
          onClick={() => navigateToThread(thread.environmentId, thread.id)}
          className={cn("font-normal", isActive && "font-medium")}
          title={title}
        >
          <MessageSquareIcon />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{title}</span>
            {providerLabel ? (
              <span className="block truncate text-[10px] font-normal text-sidebar-muted-foreground/70">
                {providerLabel}
              </span>
            ) : null}
          </span>
        </SidebarMenuButton>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted-foreground opacity-0 outline-none transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover:opacity-100"
          aria-label={`Actions for ${title}`}
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={() => onTogglePin(thread)}>
            {isPinned ? <PinOffIcon /> : <PinIcon />}
            {isPinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onStartRename(thread)}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void onArchive(thread)}
            disabled={!("session" in thread) || thread.session?.status === "running"}
          >
            <ArchiveIcon />
            Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void onDelete(thread)}
            disabled={!("session" in thread)}
          >
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

interface ChatSidebarProjectRowProps {
  readonly isActive: boolean;
  readonly onDelete: (project: ChatProject) => void;
  readonly onEdit: (project: ChatProject) => void;
  readonly onSelect: (project: ChatProject) => void;
  readonly project: ChatProject;
  readonly threadCount: number;
}

function ChatSidebarProjectRow({
  isActive,
  onDelete,
  onEdit,
  onSelect,
  project,
  threadCount,
}: ChatSidebarProjectRowProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={isActive}
        onClick={() => onSelect(project)}
        className={cn("font-medium", isActive && "font-semibold")}
        title={`${project.name}${isActive ? " (selected for new chats)" : ""}`}
      >
        <FolderIcon />
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        <span className="text-[10px] font-normal text-sidebar-muted-foreground/70">
          {threadCount}
        </span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted-foreground opacity-0 outline-none transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover:opacity-100"
          aria-label={`Actions for ${project.name}`}
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => onEdit(project)}>
            <PencilIcon />
            Edit project
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(project)}>
            <Trash2Icon />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

export default function ChatWorkspaceSidebar() {
  const threads = useThreadShells();
  const router = useRouter();
  const deleteThread = useAtomCommand(threadEnvironment.delete, { reportFailure: false });
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const activeEnvironmentId = useActiveEnvironmentId();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const serverConfigs = useServerConfigs();
  const { environments } = useEnvironments();
  const { archiveThread, confirmAndDeleteThread } = useThreadActions();
  const chatProjects = useChatProjectsStore((state) =>
    availableEnvironmentId === null
      ? EMPTY_CHAT_PROJECTS
      : state.projectsByEnvironment[availableEnvironmentId] ?? EMPTY_CHAT_PROJECTS,
  );
  const activeChatProjectId = useChatProjectsStore((state) =>
    availableEnvironmentId === null
      ? null
      : state.activeProjectIdByEnvironment[availableEnvironmentId] ?? null,
  );
  const setActiveChatProject = useChatProjectsStore((state) => state.setActiveProject);
  const deleteChatProject = useChatProjectsStore((state) => state.deleteProject);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogId, setProjectDialogId] = useState<string | null>(null);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return readChatEnvironmentSelection();
  });
  const availableEnvironmentId = resolveChatEnvironmentId(
    selectedEnvironmentId,
    activeEnvironmentId,
    primaryEnvironmentId,
    environments.map((environment) => environment.environmentId),
  );

  useEffect(() => {
    if (availableEnvironmentId === null) {
      return;
    }
    setActiveEnvironmentId(availableEnvironmentId);
    writeChatEnvironmentSelection(availableEnvironmentId);
    if (selectedEnvironmentId !== availableEnvironmentId) {
      setSelectedEnvironmentId(availableEnvironmentId);
    }
  }, [availableEnvironmentId, selectedEnvironmentId]);

  const selectedEnvironment = environments.find(
    (environment) => environment.environmentId === availableEnvironmentId,
  );
  const { isMobile, setOpenMobile } = useSidebar();
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [pinnedThreadKeys, setPinnedThreadKeys] = useState<ReadonlySet<string>>(() =>
    readChatSidebarPins(),
  );
  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const renameCancelledRef = useRef(false);
  const cleanupInFlightRef = useRef(new Set<ThreadId>());

  useEffect(() => {
    const activeThreadId =
      routeTarget?.kind === "server" ? routeTarget.threadRef.threadId : null;
    const duplicateThreadIds = findDuplicateEmptyChatThreadIds(threads, activeThreadId);
    for (const threadId of duplicateThreadIds) {
      if (cleanupInFlightRef.current.has(threadId)) continue;
      const thread = threads.find((candidate) => candidate.id === threadId);
      if (!thread) continue;
      cleanupInFlightRef.current.add(threadId);
      void deleteThread({
        environmentId: thread.environmentId,
        input: { threadId },
      }).then(
        (result) => {
          if (result._tag === "Failure") {
            cleanupInFlightRef.current.delete(threadId);
          }
        },
        () => {
          cleanupInFlightRef.current.delete(threadId);
        },
      );
    }
  }, [deleteThread, routeTarget, threads]);

  const showThreadActionError = useCallback(
    (title: string, result: { readonly _tag: string; readonly cause?: unknown }) => {
      if (result._tag === "Success" || isAtomCommandInterrupted(result as never)) return;
      const error = squashAtomCommandFailure(result as never);
      toastManager.add({
        type: "error",
        title,
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    },
    [],
  );

  const archiveChat = useCallback(
    async (thread: { readonly environmentId: EnvironmentId; readonly id: ThreadId }) => {
      const result = await archiveThread(scopeThreadRef(thread.environmentId, thread.id));
      showThreadActionError("Failed to archive chat", result);
    },
    [archiveThread, showThreadActionError],
  );

  const deleteChat = useCallback(
    async (thread: { readonly environmentId: EnvironmentId; readonly id: ThreadId }) => {
      const result = await confirmAndDeleteThread(scopeThreadRef(thread.environmentId, thread.id));
      showThreadActionError("Failed to delete chat", result);
    },
    [confirmAndDeleteThread, showThreadActionError],
  );

  const togglePin = useCallback((thread: ThreadShell) => {
    const key = sidebarPinKeyForThread(thread);
    setPinnedThreadKeys((current) =>
      setChatSidebarPin(current, sidebarPinRefForThread(thread), !current.has(key)),
    );
  }, []);

  const startRename = useCallback((thread: ThreadShell) => {
    setRenamingThreadKey(sidebarPinKeyForThread(thread));
    setRenamingTitle(thread.title);
    renameCancelledRef.current = false;
  }, []);

  const cancelRename = useCallback(() => {
    renameCancelledRef.current = true;
    setRenamingThreadKey(null);
    setRenamingTitle("");
  }, []);

  const commitRename = useCallback(
    (thread: ThreadShell) => {
      if (renameCancelledRef.current) {
        renameCancelledRef.current = false;
        return;
      }
      const nextTitle = renamingTitle.trim();
      if (nextTitle.length === 0) {
        toastManager.add({ type: "warning", title: "Chat title cannot be empty" });
        cancelRename();
        return;
      }
      if (nextTitle === thread.title) {
        cancelRename();
        return;
      }
      void updateThreadMetadata({
        environmentId: thread.environmentId,
        input: { threadId: thread.id, title: nextTitle },
      }).then((result) => {
        showThreadActionError("Failed to rename chat", result);
        if (result._tag === "Success") {
          renameCancelledRef.current = false;
          cancelRename();
        }
      });
    },
    [cancelRename, renamingTitle, showThreadActionError, updateThreadMetadata],
  );

  const chatThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sortThreadsForSidebarV2(threads)
      .filter((thread) => thread.scope === "chat" && thread.projectId === null)
      .filter(
        (thread) =>
          availableEnvironmentId === null || thread.environmentId === availableEnvironmentId,
      )
      .filter((thread) => thread.archivedAt === null)
      .filter((thread) => query.length === 0 || thread.title.toLowerCase().includes(query));
  }, [availableEnvironmentId, searchQuery, threads]);

  const pinnedThreads = useMemo(
    () =>
      chatThreads
        .filter((thread) => pinnedThreadKeys.has(sidebarPinKeyForThread(thread)))
        .slice(0, CHAT_THREAD_LIMIT),
    [chatThreads, pinnedThreadKeys],
  );

  const recentThreads = useMemo(
    () =>
      chatThreads
        .filter((thread) => !pinnedThreadKeys.has(sidebarPinKeyForThread(thread)))
        .slice(0, CHAT_THREAD_LIMIT),
    [chatThreads, pinnedThreadKeys],
  );

  const projectThreadIds = useMemo(
    () => new Set(chatProjects.flatMap((project) => project.threadIds)),
    [chatProjects],
  );
  const projectThreadsById = useMemo(() => {
    const next = new Map<string, readonly ThreadShell[]>();
    for (const project of chatProjects) {
      next.set(
        project.id,
        chatThreads.filter((thread) => project.threadIds.includes(thread.id)).slice(0, CHAT_THREAD_LIMIT),
      );
    }
    return next;
  }, [chatProjects, chatThreads]);
  const unassignedRecentThreads = useMemo(
    () => recentThreads.filter((thread) => !projectThreadIds.has(thread.id)),
    [projectThreadIds, recentThreads],
  );
  const visiblePinnedThreads = useMemo(
    () => pinnedThreads.filter((thread) => !projectThreadIds.has(thread.id)),
    [pinnedThreads, projectThreadIds],
  );
  const projectDialogProject =
    chatProjects.find((project) => project.id === projectDialogId) ?? null;

  const handleOpenNewProject = useCallback(() => {
    setProjectDialogId(null);
    setProjectDialogOpen(true);
  }, []);

  const handleEditProject = useCallback((project: ChatProject) => {
    setProjectDialogId(project.id);
    setProjectDialogOpen(true);
  }, []);

  const handleDeleteProject = useCallback(
    (project: ChatProject) => {
      if (!availableEnvironmentId) return;
      deleteChatProject(availableEnvironmentId, project.id);
      toastManager.add({ type: "success", title: `${project.name} deleted` });
    },
    [availableEnvironmentId, deleteChatProject],
  );

  const handleNewChat = useCallback(async () => {
    if (!isElectron || !availableEnvironmentId) return;
    if (isMobile) setOpenMobile(false);
    await router.navigate({ to: "/new" });
  }, [availableEnvironmentId, isMobile, router, setOpenMobile]);

  const navigateToThread = useCallback(
    (environmentId: EnvironmentId, threadId: ThreadId) => {
      if (isMobile) setOpenMobile(false);
      const threadRef = scopeThreadRef(environmentId, threadId);
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId: threadRef.environmentId,
          threadId: threadRef.threadId,
        },
      });
    },
    [isMobile, router, setOpenMobile],
  );

  const renderThreadRows = useCallback(
    (threadList: ReadonlyArray<ThreadShell>) =>
      threadList.map((thread) => {
        const threadKey = sidebarPinKeyForThread(thread);
        const isActive =
          routeTarget?.kind === "server" &&
          routeTarget.threadRef.environmentId === thread.environmentId &&
          routeTarget.threadRef.threadId === thread.id;
        const presentation = resolveChatSidebarProviderPresentation({
          modelSelection: thread.modelSelection,
          serverConfig: serverConfigs.get(thread.environmentId),
        });
        const providerLabel = presentation
          ? `${presentation.providerDisplayName} · ${presentation.modelLabel}`
          : null;

        return (
          <ChatSidebarThreadRow
            key={`${thread.environmentId}:${thread.id}`}
            isActive={isActive}
            isPinned={pinnedThreadKeys.has(threadKey)}
            isRenaming={renamingThreadKey === threadKey}
            providerLabel={providerLabel}
            navigateToThread={navigateToThread}
            onArchive={archiveChat}
            onCancelRename={cancelRename}
            onCommitRename={commitRename}
            onDelete={deleteChat}
            onRenameTitleChange={setRenamingTitle}
            onStartRename={startRename}
            onTogglePin={togglePin}
            renamingTitle={renamingTitle}
            thread={thread}
          />
        );
      }),
    [
      archiveChat,
      cancelRename,
      commitRename,
      deleteChat,
      navigateToThread,
      pinnedThreadKeys,
      renamingThreadKey,
      renamingTitle,
      routeTarget,
      serverConfigs,
      startRename,
      togglePin,
    ],
  );

  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent
        className="gap-0"
        fixedHeader={
          <SidebarGroup className="gap-2 p-[var(--sidebar-content-inset)]">
            {environments.length > 0 ? (
              <Select
                value={availableEnvironmentId ?? undefined}
                onValueChange={(value) => {
                  if (!value) return;
                  const nextEnvironmentId = environments.find(
                    (environment) => environment.environmentId === value,
                  )?.environmentId;
                  if (!nextEnvironmentId) return;
                  setSelectedEnvironmentId(value);
                  writeChatEnvironmentSelection(nextEnvironmentId);
                  setActiveEnvironmentId(nextEnvironmentId);
                  if (
                    routeTarget?.kind === "server" &&
                    routeTarget.threadRef.environmentId !== nextEnvironmentId
                  ) {
                    void router.navigate({ to: "/" });
                  }
                }}
              >
                <SelectTrigger className="h-9 w-full justify-between bg-sidebar-control-surface shadow-none">
                  <SelectValue placeholder="Choose environment">
                    {selectedEnvironment?.label ?? "Choose environment"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="start" className="min-w-[var(--anchor-width)]">
                  {environments.map((environment) => (
                    <SelectItem key={environment.environmentId} value={environment.environmentId}>
                      {environment.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-start gap-2 bg-sidebar-control-surface font-medium shadow-none"
              onClick={handleNewChat}
              disabled={availableEnvironmentId === null}
              title={availableEnvironmentId === null ? "Connect an environment first" : "New chat"}
            >
              <SquarePenIcon className="size-4" />
              New chat
            </Button>
            <div className="flex h-8 items-center gap-2 rounded-md bg-sidebar-control-surface px-2 text-sidebar-muted-foreground ring-1 ring-sidebar-border/70">
              <SearchIcon className="size-4 shrink-0" />
              <Input
                nativeInput
                unstyled
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Search chats"
                aria-label="Search chats"
                className="min-w-0 flex-1 [&_[data-slot=input]]:h-auto [&_[data-slot=input]]:p-0 [&_[data-slot=input]]:text-sm [&_[data-slot=input]]:placeholder:text-sidebar-muted-foreground"
              />
              {searchQuery.length > 0 ? (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="size-5 shrink-0"
                  aria-label="Clear chat search"
                  onClick={() => setSearchQuery("")}
                >
                  <XIcon className="size-3" />
                </Button>
              ) : null}
            </div>
          </SidebarGroup>
        }
      >
        {visiblePinnedThreads.length > 0 ? (
          <SidebarGroup className="gap-2 px-[var(--sidebar-content-inset)] pt-3">
            <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted-foreground/70">
              Pinned
            </div>
            <SidebarMenu className="gap-0.5">{renderThreadRows(visiblePinnedThreads)}</SidebarMenu>
          </SidebarGroup>
        ) : null}
        <SidebarGroup className="gap-2 px-[var(--sidebar-content-inset)] py-3">
          <div className="flex items-center justify-between px-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted-foreground/70">
              Projects
            </div>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="size-6"
              aria-label="Create project"
              onClick={handleOpenNewProject}
              disabled={availableEnvironmentId === null}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
          {chatProjects.length > 0 ? (
            <div className="grid gap-0.5">
              {chatProjects.map((project) => (
                <div key={project.id} className="grid gap-0.5">
                  <SidebarMenu className="gap-0.5">
                    <ChatSidebarProjectRow
                      isActive={project.id === activeChatProjectId}
                      onDelete={handleDeleteProject}
                      onEdit={handleEditProject}
                      onSelect={(selectedProject) => {
                        if (availableEnvironmentId) {
                          setActiveChatProject(
                            availableEnvironmentId,
                            selectedProject.id === activeChatProjectId ? null : selectedProject.id,
                          );
                        }
                      }}
                      project={project}
                      threadCount={projectThreadsById.get(project.id)?.length ?? 0}
                    />
                  </SidebarMenu>
                  {(projectThreadById(project, projectThreadsById) ?? []).length > 0 ? (
                    <SidebarMenu className="gap-0.5 pl-3">
                      {renderThreadRows(projectThreadById(project, projectThreadsById) ?? [])}
                    </SidebarMenu>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-2 text-xs text-sidebar-muted-foreground">
              Create a project for reusable instructions and sources.
            </div>
          )}
        </SidebarGroup>
        <SidebarGroup className="gap-2 px-[var(--sidebar-content-inset)] py-3">
          <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted-foreground/70">
            Recent chats
          </div>
          <SidebarMenu className="gap-0.5">{renderThreadRows(unassignedRecentThreads)}</SidebarMenu>
          {unassignedRecentThreads.length === 0 && visiblePinnedThreads.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-sidebar-muted-foreground">
              {searchQuery.trim().length > 0
                ? "No chats found"
                : "Your recent chats will appear here"}
            </div>
          ) : null}
        </SidebarGroup>
      </SidebarContent>
      <SidebarChromeFooter />
      {availableEnvironmentId !== null ? (
        <ChatProjectDialog
          environmentId={availableEnvironmentId}
          onCreated={(projectId) => {
            setProjectDialogId(projectId);
            setActiveChatProject(availableEnvironmentId, projectId);
          }}
          onOpenChange={setProjectDialogOpen}
          open={projectDialogOpen}
          project={projectDialogProject}
        />
      ) : null}
    </>
  );
}

function projectThreadById(
  project: ChatProject,
  projectThreadsById: ReadonlyMap<string, readonly ThreadShell[]>,
): readonly ThreadShell[] {
  return projectThreadsById.get(project.id) ?? EMPTY_THREAD_LIST;
}

const EMPTY_THREAD_LIST: readonly ThreadShell[] = [];
