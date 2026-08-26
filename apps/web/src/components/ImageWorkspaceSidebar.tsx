import { ImageIcon, PlusIcon } from "lucide-react";

import { isElectron } from "../env";
import { useWorkspace } from "../workspace";
import { Button } from "./ui/button";
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "./ui/sidebar";
import { SidebarChromeFooter, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { WorkspaceContextRail } from "./sidebar/WorkspaceSwitcher";

export function ImageWorkspaceSidebar() {
  const { activeWorkspace } = useWorkspace();

  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <WorkspaceContextRail />
      <SidebarContent className="gap-0">
        <SidebarGroup className="border-b border-sidebar-border/60 px-3 py-4">
          <SidebarGroupLabel className="px-0 text-[11px] uppercase tracking-[0.16em] text-sidebar-foreground/45">
            {activeWorkspace.sidebarTitle}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="mt-2 flex flex-col gap-3 text-sm text-sidebar-foreground/65">
              <div className="flex items-start gap-2.5">
                <ImageIcon className="mt-0.5 size-4 shrink-0 text-fuchsia-400" aria-hidden="true" />
                <p className="leading-relaxed">
                  Create images with OpenRouter models and keep every result in this workspace.
                </p>
              </div>
              <Button
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => document.getElementById("zimage-prompt")?.focus()}
              >
                <PlusIcon className="size-4" aria-hidden="true" />
                New generation
              </Button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}
