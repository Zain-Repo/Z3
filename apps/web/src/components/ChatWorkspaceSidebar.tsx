import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import {
  ArchiveIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
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
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { isElectron } from "../env";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { cn } from "../lib/utils";
import {
  findDuplicateEmptyChatThreadIds,
  readChatEnvironmentSelection,
  resolveChatEnvironmentId,
  writeChatEnvironmentSelection,
} from "../lib/chatThreadCreation";
import { resolveChatSidebarProviderPresentation } from "../lib/chatSidebarProviderPresentation";
import { chatSidebarPinKey, readChatSidebarPins, setChatSidebarPin } from "../lib/chatSidebarPins";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { type ChatProject, useChatProjectsStore } from "../lib/chatProjects";
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
import { Spinner } from "./ui/spinner";
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
  const isThreadRunning =
    thread.session?.status === "running" && thread.session.activeTurnId != null;

  return (
    <SidebarMenuItem className="flex items-center gap-1">
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
          variant="chat"
          onClick={() => navigateToThread(thread.environmentId, thread.id)}
          className={cn("font-normal", isActive && "font-medium")}
          title={title}
        >
          {isThreadRunning ? (
            <Spinner
              aria-label="Model is working"
              className="size-4 shrink-0 text-sidebar-muted-foreground motion-reduce:animate-none"
            />
          ) : (
            <MessageSquareIcon />
          )}
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
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted-foreground opacity-0 outline-none transition-opacity hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100"
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
  readonly hasVisibleThreads: boolean;
  readonly isExpanded: boolean;
  readonly isActive: boolean;
  readonly onDelete: (project: ChatProject) => void;
  readonly onEdit: (project: ChatProject) => void;
  readonly onToggleExpanded: (projectId: string) => void;
  readonly onSelect: (project: ChatProject) => void;
  readonly projectPanelId: string;
  readonly project: ChatProject;
  readonly threadCount: number;
}

function ChatSidebarProjectRow({
  hasVisibleThreads,
  isExpanded,
  isActive,
  onDelete,
  onEdit,
  onToggleExpanded,
  onSelect,
  projectPanelId,
  project,
  threadCount,
}: ChatSidebarProjectRowProps) {
  const isReducedMotion = useReducedMotion() ?? false;
  const projectIsOpen = hasVisibleThreads && isExpanded;

  return (
    <SidebarMenuItem className="group flex items-center gap-0.5 rounded-lg px-1">
      <SidebarMenuButton
        type="button"
        isActive={isActive}
        variant="chat"
        aria-expanded={projectIsOpen}
        aria-label={`${projectIsOpen ? "Collapse" : "Open"} ${project.name}`}
        {...(hasVisibleThreads ? { "aria-controls": projectPanelId } : {})}
        className={cn("min-w-0 flex-1", isActive && "font-medium")}
        title={`${project.name}${isActive ? " (selected for new chats)" : ""}`}
        onClick={() => {
          onSelect(project);
          if (hasVisibleThreads) {
            onToggleExpanded(project.id);
          }
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={projectIsOpen ? "open" : "closed"}
            initial={isReducedMotion ? false : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={
              isReducedMotion
                ? { opacity: 1, scale: 1, filter: "blur(0px)" }
                : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
            }
            transition={
              isReducedMotion ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }
            }
            className="flex"
            aria-hidden="true"
          >
            {projectIsOpen ? (
              <FolderOpenIcon className="size-4" />
            ) : (
              <FolderIcon className="size-4" />
            )}
          </motion.span>
        </AnimatePresence>
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        {project.isPinned ? <PinIcon className="size-3 shrink-0 text-sidebar-muted-foreground" /> : null}
        <span className="text-[10px] font-normal text-sidebar-muted-foreground/70 tabular-nums">
          {threadCount}
        </span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted-foreground opacity-0 outline-none transition-opacity hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100"
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
  const isReducedMotion = useReducedMotion() ?? false;
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
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogId, setProjectDialogId] = useState<string | null>(null);
  const [collapsedProjectKeys, setCollapsedProjectKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
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
  const chatProjects = useChatProjectsStore((state) =>
    availableEnvironmentId === null
      ? EMPTY_CHAT_PROJECTS
      : (state.projectsByEnvironment[availableEnvironmentId] ?? EMPTY_CHAT_PROJECTS),
  );
  const activeChatProjectId = useChatProjectsStore((state) =>
    availableEnvironmentId === null
      ? null
      : (state.activeProjectIdByEnvironment[availableEnvironmentId] ?? null),
  );
  const setActiveChatProject = useChatProjectsStore((state) => state.setActiveProject);
  const deleteChatProject = useChatProjectsStore((state) => state.deleteProject);

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
  const [isRecentChatsExpanded, setIsRecentChatsExpanded] = useState(true);
  const renameCancelledRef = useRef(false);
  const cleanupInFlightRef = useRef(new Set<ThreadId>());

  useEffect(() => {
    const activeThreadId = routeTarget?.kind === "server" ? routeTarget.threadRef.threadId : null;
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
  const orderedChatProjects = useMemo(
    () => [...chatProjects].sort((left, right) => Number(right.isPinned) - Number(left.isPinned)),
    [chatProjects],
  );
  const projectThreadsById = useMemo(() => {
    const next = new Map<string, readonly ThreadShell[]>();
    for (const project of chatProjects) {
      next.set(
        project.id,
        chatThreads
          .filter((thread) => project.threadIds.includes(thread.id))
          .slice(0, CHAT_THREAD_LIMIT),
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

  const projectExpansionKey = useCallback(
    (projectId: string) => `${availableEnvironmentId ?? "unknown"}:${projectId}`,
    [availableEnvironmentId],
  );

  const isProjectExpanded = useCallback(
    (projectId: string) => !collapsedProjectKeys.has(projectExpansionKey(projectId)),
    [collapsedProjectKeys, projectExpansionKey],
  );

  const toggleProjectExpanded = useCallback(
    (projectId: string) => {
      const key = projectExpansionKey(projectId);
      setCollapsedProjectKeys((current) => {
        const next = new Set(current);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [projectExpansionKey],
  );

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

  const handleNewChat = useCallback(async (projectId: string | null = null) => {
    if (!isElectron || !availableEnvironmentId) return;
    // A plain new chat is not project-scoped. Project rows pass their id
    // explicitly so selecting a project remains an intentional action.
    setActiveChatProject(availableEnvironmentId, projectId);
    if (isMobile) setOpenMobile(false);
    await router.navigate({ to: "/new" });
  }, [availableEnvironmentId, isMobile, router, setActiveChatProject, setOpenMobile]);

  const navigateToThread = useCallback(
    (environmentId: EnvironmentId, threadId: ThreadId) => {
      if (isMobile) setOpenMobile(false);
      const threadRef = scopeThreadRef(environmentId, threadId);
      const isProjectChat = chatProjects.some((project) => project.threadIds.includes(threadId));
      if (!isProjectChat && availableEnvironmentId === environmentId) {
        // Recent chats are intentionally outside every project. Clear the
        // remembered project so the chat surface follows the selected thread.
        setActiveChatProject(environmentId, null);
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId: threadRef.environmentId,
          threadId: threadRef.threadId,
        },
      });
    },
    [availableEnvironmentId, chatProjects, isMobile, router, setActiveChatProject, setOpenMobile],
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
        className="chat-sidebar-content gap-0"
        data-chat-sidebar=""
        fixedHeader={
          <SidebarGroup className="gap-1 p-[var(--sidebar-content-inset)]">
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
                <SelectTrigger className="h-8 w-full justify-between rounded-md border-0 bg-transparent px-2 text-sm font-normal text-sidebar-foreground/80 shadow-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring">
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
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  variant="chat"
                  onClick={() => void handleNewChat()}
                  disabled={availableEnvironmentId === null}
                  title={
                    availableEnvironmentId === null ? "Connect an environment first" : "New chat"
                  }
                >
                  <SquarePenIcon className="size-4" />
                  New chat
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted-foreground transition-colors focus-within:bg-sidebar-row-hover focus-within:text-sidebar-foreground hover:bg-sidebar-row-hover motion-reduce:transition-none">
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
          <SidebarGroup className="gap-1 px-[var(--sidebar-content-inset)] pt-3">
            <div className="px-2 text-xs font-semibold leading-5 tracking-[0.04em] text-sidebar-muted-foreground/55">
              Pinned
            </div>
            <SidebarMenu className="gap-0.5">{renderThreadRows(visiblePinnedThreads)}</SidebarMenu>
          </SidebarGroup>
        ) : null}
        <SidebarGroup className="gap-1 px-[var(--sidebar-content-inset)] py-3">
          <div className="flex items-center justify-between px-2">
            <div className="text-xs font-semibold leading-5 tracking-[0.04em] text-sidebar-muted-foreground/55">
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
          {orderedChatProjects.length > 0 ? (
            <div className="grid gap-0.5">
              {orderedChatProjects.map((project) => {
                const projectThreads = projectThreadById(project, projectThreadsById);
                const hasVisibleThreads = projectThreads.length > 0;
                const projectPanelId = `chat-project-panel-${project.id}`;

                return (
                  <div key={project.id} className="grid gap-0.5">
                    <SidebarMenu className="gap-0.5">
                      <ChatSidebarProjectRow
                        hasVisibleThreads={hasVisibleThreads}
                        isExpanded={isProjectExpanded(project.id)}
                        isActive={project.id === activeChatProjectId}
                        onDelete={handleDeleteProject}
                        onEdit={handleEditProject}
                        onToggleExpanded={toggleProjectExpanded}
                        onSelect={(selectedProject) => {
                          if (availableEnvironmentId) {
                            void handleNewChat(selectedProject.id);
                          }
                        }}
                        projectPanelId={projectPanelId}
                        project={project}
                        threadCount={projectThreads.length}
                      />
                    </SidebarMenu>
                    <AnimatePresence initial={false}>
                      {hasVisibleThreads && isProjectExpanded(project.id) ? (
                        <motion.div
                          key="project-chats"
                          id={projectPanelId}
                          initial={{ opacity: 0, height: 0, y: -4 }}
                          animate={{ opacity: 1, height: "auto", y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -4 }}
                          transition={
                            isReducedMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }
                          }
                          className="overflow-hidden"
                        >
                          <SidebarMenu className="gap-0.5 ps-9">
                            {renderThreadRows(projectThreads)}
                          </SidebarMenu>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-2 text-xs text-sidebar-muted-foreground">
              Create a project for reusable instructions and sources.
            </div>
          )}
        </SidebarGroup>
        <SidebarGroup className="gap-1 px-[var(--sidebar-content-inset)] py-3">
          <div className="flex items-center justify-between px-2">
            <button
              type="button"
              className="group flex min-w-0 items-center gap-1.5 rounded-md py-1 text-left text-xs font-semibold leading-5 tracking-[0.04em] text-sidebar-muted-foreground/55 transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring motion-reduce:transition-none"
              aria-expanded={isRecentChatsExpanded}
              aria-controls="chat-recent-chats-panel"
              onClick={() => setIsRecentChatsExpanded((expanded) => !expanded)}
            >
              <ChevronRightIcon
                className={cn(
                  "size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
                  isRecentChatsExpanded && "rotate-90",
                )}
                aria-hidden="true"
              />
              <span>Recent chats</span>
            </button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="size-6"
              aria-label="New chat"
              onClick={() => void handleNewChat()}
              disabled={availableEnvironmentId === null}
              title={availableEnvironmentId === null ? "Connect an environment first" : "New chat"}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
          <AnimatePresence initial={false} mode="popLayout">
            {isRecentChatsExpanded ? (
              <motion.div
                key="recent-chats"
                id="chat-recent-chats-panel"
                initial={isReducedMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
                transition={
                  isReducedMotion ? { duration: 0 } : { duration: 0.16, ease: "easeOut" }
                }
                className="grid gap-1"
              >
                <SidebarMenu className="gap-0.5">
                  {renderThreadRows(unassignedRecentThreads)}
                </SidebarMenu>
                {unassignedRecentThreads.length === 0 && visiblePinnedThreads.length === 0 ? (
                  <div className="px-2 py-6 text-center text-xs leading-5 text-sidebar-muted-foreground">
                    {searchQuery.trim().length > 0
                      ? "No chats found"
                      : "Your recent chats will appear here"}
                  </div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
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
