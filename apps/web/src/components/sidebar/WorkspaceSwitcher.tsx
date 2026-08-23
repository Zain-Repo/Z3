import { ChevronDownIcon } from "lucide-react";
import { memo } from "react";
import { useNavigate } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/menu";
import { isWorkspaceId, useWorkspace } from "../../workspace";

export const WorkspaceSwitcher = memo(function WorkspaceSwitcher() {
  const { activeWorkspace, setWorkspace, workspaces } = useWorkspace();
  const navigate = useNavigate();
  const ActiveIcon = activeWorkspace.icon;

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Switch workspace. Current workspace: ${activeWorkspace.label}`}
        render={<Button variant="ghost" size="sm" />}
        className="min-w-0 max-w-[11rem] justify-start gap-1.5 px-2 text-foreground/90 hover:bg-foreground/8 hover:text-foreground focus-visible:ring-2"
      >
        <ActiveIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
        <span className="min-w-0 truncate text-xs font-semibold tracking-tight">
          {activeWorkspace.label}
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
      </MenuTrigger>
      <MenuPopup align="start" className="w-60">
        <MenuGroup>
          <MenuGroupLabel>Workspace</MenuGroupLabel>
          <MenuRadioGroup
            value={activeWorkspace.id}
            onValueChange={(value) => {
              if (isWorkspaceId(value)) {
                setWorkspace(value);
                if (value === "chat" || activeWorkspace.id === "chat") {
                  void navigate({ to: "/" });
                }
              }
            }}
          >
            {workspaces.map((workspace) => {
              const Icon = workspace.icon;
              return (
                <MenuRadioItem
                  key={workspace.id}
                  value={workspace.id}
                  disabled={workspace.disabled}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{workspace.label}</span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {workspace.description}
                      </span>
                    </span>
                  </span>
                </MenuRadioItem>
              );
            })}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
});

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
