import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import {
  ArchiveIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "@tanstack/react-router";

import { isElectron } from "../env";
import { cn } from "../lib/utils";
import { isAtomCommandInterrupted, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  findDuplicateEmptyChatThreadIds,
  readChatEnvironmentSelection,
  resolveChatEnvironmentId,
  writeChatEnvironmentSelection,
} from "../lib/chatThreadCreation";
import { resolveThreadRouteTarget } from "../threadRoutes";
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

const CHAT_THREAD_LIMIT = 40;

export default function ChatWorkspaceSidebar() {
  const threads = useThreadShells();
  const router = useRouter();
  const deleteThread = useAtomCommand(threadEnvironment.delete, { reportFailure: false });
  const activeEnvironmentId = useActiveEnvironmentId();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const { archiveThread, confirmAndDeleteThread } = useThreadActions();
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

  const recentThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sortThreadsForSidebarV2(threads)
      .filter((thread) => thread.scope === "chat" && thread.projectId === null)
      .filter(
        (thread) =>
          availableEnvironmentId === null || thread.environmentId === availableEnvironmentId,
      )
      .filter((thread) => thread.archivedAt === null)
      .filter((thread) => query.length === 0 || thread.title.toLowerCase().includes(query))
      .slice(0, CHAT_THREAD_LIMIT);
  }, [availableEnvironmentId, searchQuery, threads]);

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
        <SidebarGroup className="gap-2 px-[var(--sidebar-content-inset)] py-3">
          <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted-foreground/70">
            Recent chats
          </div>
          <SidebarMenu className="gap-0.5">
            {recentThreads.map((thread) => {
              const isActive =
                routeTarget?.kind === "server" &&
                routeTarget.threadRef.environmentId === thread.environmentId &&
                routeTarget.threadRef.threadId === thread.id;
              return (
                <SidebarMenuItem
                  key={`${thread.environmentId}:${thread.id}`}
                  className="flex items-center gap-1"
                >
                  <SidebarMenuButton
                    type="button"
                    isActive={isActive}
                    onClick={() => navigateToThread(thread.environmentId, thread.id)}
                    className={cn("font-normal", isActive && "font-medium")}
                    title={thread.title}
                  >
                    <MessageSquareIcon />
                    <span>{thread.title || "New chat"}</span>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted-foreground opacity-0 outline-none transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover:opacity-100"
                      aria-label={`Actions for ${thread.title || "New chat"}`}
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem
                        onClick={() => void archiveChat(thread)}
                        disabled={!("session" in thread) || thread.session?.status === "running"}
                      >
                        <ArchiveIcon />
                        Archive
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => void deleteChat(thread)}
                        disabled={!("session" in thread)}
                      >
                        <Trash2Icon />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
          {recentThreads.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-sidebar-muted-foreground">
              {searchQuery.trim().length > 0
                ? "No chats found"
                : "Your recent chats will appear here"}
            </div>
          ) : null}
        </SidebarGroup>
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}
