import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import { MessageSquareIcon, SearchIcon, SquarePenIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "@tanstack/react-router";

import { isElectron } from "../env";
import { cn, newThreadId } from "../lib/utils";
import {
  buildChatThreadCreateInput,
  readChatEnvironmentSelection,
  resolveChatEnvironmentId,
  resolveChatModelSelection,
  writeChatEnvironmentSelection,
} from "../lib/chatThreadCreation";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { useAtomCommand } from "../state/use-atom-command";
import { threadEnvironment } from "../state/threads";
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
import { toastManager } from "./ui/toast";

const CHAT_THREAD_LIMIT = 40;

export default function ChatWorkspaceSidebar() {
  const threads = useThreadShells();
  const router = useRouter();
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const activeEnvironmentId = useActiveEnvironmentId();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const serverConfigs = useServerConfigs();
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
    const threadId = newThreadId();
    const selection = resolveChatModelSelection(
      serverConfigs.get(availableEnvironmentId)?.providers,
    );
    if (!selection) {
      toastManager.add({
        type: "error",
        title: "No chat provider is available",
        description: "Enable a provider for this environment, then try again.",
      });
      return;
    }
    const result = await createThread({
      environmentId: availableEnvironmentId,
      input: buildChatThreadCreateInput({ threadId, selection }),
    });
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: "Could not start chat",
        description: "The environment rejected the new chat. Try again.",
      });
      return;
    }
    await router.navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: availableEnvironmentId, threadId },
    });
  }, [availableEnvironmentId, createThread, isMobile, router, serverConfigs, setOpenMobile]);

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
                <SidebarMenuItem key={`${thread.environmentId}:${thread.id}`}>
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
