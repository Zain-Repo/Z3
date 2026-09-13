import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRightIcon, FolderPlusIcon, LinkIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { openCommandPalette } from "../commandPaletteBus";
import { sortScopedProjectsForSidebar } from "../components/Sidebar.logic";
import { ImageWorkspacePage } from "../components/ImageWorkspacePage";
import { Button } from "../components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { SidebarInset } from "../components/ui/sidebar";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { isElectron } from "../env";
import { useWorkspace } from "../workspace";
import { isProjectThread } from "@t3tools/client-runtime/state/models";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useThreadShells,
} from "../state/entities";
import { useEnvironments } from "../state/environments";
import { APP_DISPLAY_NAME } from "~/branding";
import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";
import { Z3Mark } from "../components/Z3Mark";

function ChatIndexRouteView() {
  const { authGateState } = Route.useRouteContext();
  const { environments } = useEnvironments();
  const { activeWorkspace } = useWorkspace();

  if (authGateState.status === "hosted-static" && environments.length === 0) {
    return <HostedStaticOnboardingState />;
  }

  if (activeWorkspace.id === "image") {
    return <ImageWorkspacePage />;
  }

  if (isElectron && activeWorkspace.id === "chat") {
    return <ChatWorkspaceLanding />;
  }

  return <IndexDraftLanding />;
}

function ChatWorkspaceLanding() {
  const navigate = useNavigate();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const startingRef = useRef(false);

  useEffect(() => {
    if (!bootstrapped || startingRef.current) {
      return;
    }
    startingRef.current = true;
    void navigate({ to: "/new", replace: true });
  }, [bootstrapped, navigate]);

  return null;
}

/**
 * Landing on the index route drops straight into a draft thread for the most
 * recently active project, so the first screen is a prompt instead of a dead
 * end. Falls back to an add-project hero when no project exists yet.
 */
function IndexDraftLanding() {
  const projects = useProjects();
  const threads = useThreadShells();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const handleNewThread = useNewThreadHandler();
  const startingRef = useRef(false);
  const [startState, setStartState] = useState({ failed: false, retryRequest: 0 });

  const mostRecentProject = useMemo(
    () =>
      bootstrapped
        ? (sortScopedProjectsForSidebar(
            projects,
            threads.filter(isProjectThread),
            "updated_at",
          )[0] ?? null)
        : null,
    [bootstrapped, projects, threads],
  );

  useEffect(() => {
    if (mostRecentProject === null || startingRef.current) {
      return;
    }
    startingRef.current = true;
    void handleNewThread(scopeProjectRef(mostRecentProject.environmentId, mostRecentProject.id), {
      replace: true,
    }).catch(() => {
      startingRef.current = false;
      setStartState((state) => ({ ...state, failed: true }));
    });
  }, [handleNewThread, mostRecentProject, startState.retryRequest]);

  if (!bootstrapped) {
    return null;
  }
  if (mostRecentProject !== null) {
    return startState.failed ? (
      <DraftStartError
        onRetry={() => {
          setStartState((state) => ({
            failed: false,
            retryRequest: state.retryRequest + 1,
          }));
        }}
      />
    ) : null;
  }
  return <NoProjectsHero />;
}

function DraftStartError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <Empty className="flex-1">
        <EmptyHeader className="max-w-md">
          <EmptyTitle className="text-foreground text-xl">Couldn’t start a new thread</EmptyTitle>
          <EmptyDescription className="mt-2 text-sm text-muted-foreground/78">
            The project is still available. Try opening the draft again.
          </EmptyDescription>
          <div className="mt-5 flex justify-center">
            <Button size="sm" onClick={onRetry}>
              <RotateCcwIcon className="size-4" />
              Try again
            </Button>
          </div>
        </EmptyHeader>
      </Empty>
    </SidebarInset>
  );
}

function NoProjectsHero() {
  const openAddProject = useCallback(() => openCommandPalette({ open: "add-project" }), []);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-y-auto overscroll-y-none bg-background text-foreground">
      <div className="z3-start-surface flex min-h-full flex-col justify-center px-6 py-20 sm:px-12">
        <section
          className="mx-auto grid w-full max-w-4xl gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16"
          aria-labelledby="z3-welcome-title"
        >
          <div className="flex flex-col items-start">
            <Z3Mark className="mb-8 size-12 rounded-xl text-xl" />
            <p className="mb-3 font-mono text-xs tracking-[0.14em] text-primary">
              YOUR WORK, IN ONE PLACE
            </p>
            <h1
              id="z3-welcome-title"
              className="max-w-md text-balance text-4xl font-medium leading-tight tracking-[-0.045em] sm:text-5xl"
            >
              A workspace for what comes next.
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">
              Bring your project and your agents. Z3 keeps the conversation, code, and next step
              together.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3">
            <button type="button" onClick={openAddProject} className="z3-start-action group">
              <FolderPlusIcon aria-hidden="true" className="size-5 text-primary" />
              <span className="flex-1 text-left">
                <span className="block font-medium">Open a project</span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  Choose a folder on a connected environment and start a thread.
                </span>
              </span>
              <ArrowUpRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
              />
            </button>
            <Link to="/settings/connections" className="z3-start-action group">
              <LinkIcon aria-hidden="true" className="size-5 text-primary" />
              <span className="flex-1 text-left">
                <span className="block font-medium">Connect an environment</span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  Work with agents on another machine, wherever you are.
                </span>
              </span>
              <ArrowUpRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
              />
            </Link>
            <Button
              variant="ghost"
              className="mt-1 self-start text-xs text-muted-foreground"
              render={<Link to="/settings/providers" />}
            >
              Manage your providers <ArrowUpRightIcon className="size-3.5" />
            </Button>
          </div>
        </section>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});

function HostedStaticOnboardingState() {
  const cloudEnabled = hasCloudPublicConfig();

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <header
          className={cn(
            "border-b border-border px-3 py-2 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-5 sm:py-3",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
              {APP_DISPLAY_NAME}
            </span>
          </div>
        </header>

        <Empty className="flex-1">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card px-8 py-12">
            <EmptyHeader className="max-w-none">
              <Z3Mark className="mb-6 size-12 rounded-xl text-xl" />
              <EmptyTitle className="text-foreground text-xl">
                Connect an environment to get started
              </EmptyTitle>
              <EmptyDescription className="mt-2 text-sm leading-relaxed text-muted-foreground/78">
                {cloudEnabled
                  ? "Sign in to T3 Connect to connect a linked environment through its managed tunnel, or add a reachable backend manually."
                  : "Add a reachable backend manually to start working from this browser."}
              </EmptyDescription>
              <div className="mt-6 flex justify-center">
                <Button render={<Link to="/settings/connections" />} size="sm">
                  <PlusIcon className="size-4" />
                  {cloudEnabled ? "Open Connections" : "Add environment"}
                </Button>
              </div>
            </EmptyHeader>
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}
