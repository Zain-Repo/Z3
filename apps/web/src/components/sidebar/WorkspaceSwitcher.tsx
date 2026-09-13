import { useLocation, useNavigate } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { isWorkspaceId, useWorkspace } from "../../workspace";
import { shouldResetWorkspaceRoute } from "./WorkspaceSwitcher.logic";
import { ToggleGroup, Toggle } from "../ui/toggle-group";
import { useSidebar } from "../ui/sidebar";

const WORKSPACE_SHORT_LABELS = { code: "Code", chat: "Chat", image: "Image" } as const;

/** Direct workspace access, preserving each workspace's route boundaries. */
export function WorkspaceNavigation() {
  const { activeWorkspace, setWorkspace, workspaces } = useWorkspace();
  const { setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <nav aria-label="Z3 workspaces" className="px-3 pb-3 pt-1">
      <ToggleGroup
        aria-label="Workspace"
        value={[activeWorkspace.id]}
        className="w-full gap-1 rounded-xl bg-background/60 p-1"
        onValueChange={(values) => {
          const next = values[0];
          if (typeof next !== "string" || !isWorkspaceId(next) || next === activeWorkspace.id)
            return;
          const resetRoute = shouldResetWorkspaceRoute(pathname, activeWorkspace.id, next);
          setWorkspace(next);
          setOpenMobile(false);
          if (resetRoute) void navigate({ to: "/" });
        }}
      >
        {workspaces.map((workspace) => {
          const Icon = workspace.icon;
          return (
            <Toggle
              key={workspace.id}
              value={workspace.id}
              disabled={workspace.disabled}
              aria-label={workspace.label}
              title={workspace.description}
              className="h-9 min-w-0 flex-1 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-xs"
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {WORKSPACE_SHORT_LABELS[workspace.id]}
            </Toggle>
          );
        })}
      </ToggleGroup>
    </nav>
  );
}

export function WorkspaceContextRail() {
  const { activeWorkspace } = useWorkspace();
  const Icon = activeWorkspace.icon;

  return (
    <div
      className={cn(
        "flex min-h-10 shrink-0 items-center gap-2 border-b border-sidebar-border/60 px-[var(--sidebar-content-inset)] py-2",
        "text-sidebar-foreground/80 transition-[color,background-color] duration-150 ease-out motion-reduce:transition-none",
      )}
      data-workspace-context=""
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{activeWorkspace.sidebarTitle}</span>
        <span className="block truncate text-[11px] text-sidebar-foreground/55">
          {activeWorkspace.sidebarDescription}
        </span>
      </span>
    </div>
  );
}
