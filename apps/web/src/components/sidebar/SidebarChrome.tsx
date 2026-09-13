import { CommandIcon, LibraryIcon, PaletteIcon, SettingsIcon } from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { memo, useCallback } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdatePill } from "./SidebarUpdatePill";
import { WorkspaceContextRail, WorkspaceNavigation } from "./WorkspaceSwitcher";
import { useWorkspace } from "../../workspace";
import { useActiveEnvironmentId } from "../../state/entities";
import { useChatProjectsStore } from "../../lib/chatProjects";
import { Z3Mark } from "../Z3Mark";
import { openCommandPalette } from "../../commandPaletteBus";
import { shortcutLabelForCommand } from "../../keybindings";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { Kbd } from "../ui/kbd";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const { activeWorkspace } = useWorkspace();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { setOpenMobile } = useSidebar();
  const activeEnvironmentId = useActiveEnvironmentId();
  const setActiveChatProject = useChatProjectsStore((state) => state.setActiveProject);
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <>
      <SidebarHeader
        className={cn(
          "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 transition-[background-color] duration-150 ease-out motion-reduce:transition-none md:px-0",
          activeWorkspace.topbarClassName,
          isElectron && "drag-region",
        )}
      >
        {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
        <SidebarTrigger
          className={cn(
            "relative z-10 md:hidden",
            backdropVariant &&
              "[:hover,[data-pressed]]:bg-white/15 focus-visible:ring-white/90 focus-visible:ring-offset-blue-700 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white!",
          )}
        />
        <SidebarBrand
          onBackdrop={backdropVariant !== null}
          onClick={
            activeWorkspace.id === "chat" && activeEnvironmentId !== null
              ? () => setActiveChatProject(activeEnvironmentId, null)
              : undefined
          }
        />
        <span
          className={cn(
            "relative z-10 truncate text-xs font-medium",
            backdropVariant ? "text-white/85" : "text-muted-foreground",
          )}
        >
          Workspace
        </span>
        {pillLabel ? (
          <Badge
            className="relative z-10 ml-1 rounded-full px-1.5 text-muted-foreground"
            data-environment-identification="pill"
            size="sm"
            variant="secondary"
          >
            {pillLabel}
          </Badge>
        ) : null}
      </SidebarHeader>
      <WorkspaceNavigation />
      {activeWorkspace.id === "chat" ? <WorkspaceContextRail /> : null}
      {activeWorkspace.id === "chat" ? (
        <SidebarMenu className="px-[var(--sidebar-content-inset)] pt-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === "/library"}
              variant="chat"
              render={<Link to="/library" />}
              onClick={() => setOpenMobile(false)}
            >
              <LibraryIcon />
              <span>Library</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      ) : null}
    </>
  );
});

function SidebarBrand({
  onBackdrop,
  onClick,
}: {
  onBackdrop: boolean;
  onClick?: (() => void) | undefined;
}) {
  return (
    <Link
      aria-label="Z3 home"
      onClick={onClick}
      className={cn(
        "sidebar-brand relative z-10 h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 md:ml-[var(--workspace-titlebar-content-left)]",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <Z3Mark
        className={cn("size-7 rounded-md text-xs", onBackdrop && "bg-white text-stone-900")}
      />
    </Link>
  );
}

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const commandShortcut = shortcutLabelForCommand(keybindings, "commandPalette.toggle");
  const handleSettingsClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/settings" });
  }, [isMobile, navigate, setOpenMobile]);

  return (
    <SidebarFooter className="gap-2 border-t border-sidebar-border p-3">
      <SidebarProviderUpdatePill />
      <SidebarUpdatePill />
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => {
              setOpenMobile(false);
              openCommandPalette();
            }}
          >
            <CommandIcon />
            <span>Commands</span>
            {commandShortcut ? <Kbd className="ml-auto text-[10px]">{commandShortcut}</Kbd> : null}
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => {
              setOpenMobile(false);
              void navigate({ to: "/settings/appearance" });
            }}
          >
            <PaletteIcon />
            <span>Personalize workspace</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={handleSettingsClick}>
            <SettingsIcon />
            <span>Settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
});
