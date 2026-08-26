import { Code2Icon, ImageIcon, MessageCircleIcon, type LucideIcon } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import * as Schema from "effect/Schema";

import { useLocalStorage } from "./hooks/useLocalStorage";
import { isElectron } from "./env";

export type WorkspaceId = "code" | "chat" | "image";

export interface WorkspaceDefinition {
  readonly id: WorkspaceId;
  readonly label: string;
  readonly description: string;
  readonly sidebarTitle: string;
  readonly sidebarDescription: string;
  readonly icon: LucideIcon;
  readonly topbarClassName: string;
  readonly sidebarClassName: string;
  readonly disabled?: boolean;
}

export const WORKSPACE_DEFINITIONS: ReadonlyArray<WorkspaceDefinition> = [
  {
    id: "code",
    label: "Z3Code",
    description: "Build with your coding agents",
    sidebarTitle: "Projects",
    sidebarDescription: "Your coding workspace",
    icon: Code2Icon,
    topbarClassName: "bg-blue-500/[0.08]",
    sidebarClassName: "[&_[data-workspace-context]]:text-blue-500",
  },
  {
    id: "chat",
    label: "Z3Chat",
    description: "Talk with your agents",
    sidebarTitle: "Conversations",
    sidebarDescription: "Your chat workspace",
    icon: MessageCircleIcon,
    topbarClassName: "bg-emerald-500/[0.08]",
    sidebarClassName: "[&_[data-workspace-context]]:text-emerald-500",
  },
  {
    id: "image",
    label: "ZImage",
    description: "Create with image models",
    sidebarTitle: "Generations",
    sidebarDescription: "Your image workspace",
    icon: ImageIcon,
    topbarClassName: "bg-fuchsia-500/[0.08]",
    sidebarClassName: "[&_[data-workspace-context]]:text-fuchsia-500",
  },
];
const BROWSER_WORKSPACE_DEFINITIONS = WORKSPACE_DEFINITIONS.filter(
  (workspace) => workspace.id === "code" || workspace.id === "image",
);

export const WORKSPACE_ID_SCHEMA = Schema.Literals(["code", "chat", "image"]);
export const WORKSPACE_STORAGE_KEY = "t3code:active-workspace";
export const DEFAULT_WORKSPACE_ID: WorkspaceId = "code";

export function isWorkspaceId(value: string): value is WorkspaceId {
  return WORKSPACE_DEFINITIONS.some((workspace) => workspace.id === value);
}

export function getWorkspaceDefinition(workspaceId: WorkspaceId): WorkspaceDefinition {
  return (
    WORKSPACE_DEFINITIONS.find((workspace) => workspace.id === workspaceId) ??
    WORKSPACE_DEFINITIONS[0]!
  );
}

interface WorkspaceContextValue {
  readonly activeWorkspace: WorkspaceDefinition;
  readonly setWorkspace: (workspaceId: WorkspaceId) => void;
  readonly workspaces: ReadonlyArray<WorkspaceDefinition>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { readonly children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useLocalStorage(
    WORKSPACE_STORAGE_KEY,
    DEFAULT_WORKSPACE_ID,
    WORKSPACE_ID_SCHEMA,
  );
  const availableWorkspaces = isElectron ? WORKSPACE_DEFINITIONS : BROWSER_WORKSPACE_DEFINITIONS;
  const persistedWorkspace = getWorkspaceDefinition(workspaceId);
  const activeWorkspace = persistedWorkspace.disabled
    ? getWorkspaceDefinition(DEFAULT_WORKSPACE_ID)
    : (availableWorkspaces.find((workspace) => workspace.id === persistedWorkspace.id) ??
      getWorkspaceDefinition(DEFAULT_WORKSPACE_ID));
  const setWorkspace = useCallback(
    (nextWorkspaceId: WorkspaceId) => {
      if (!getWorkspaceDefinition(nextWorkspaceId).disabled) {
        setWorkspaceId(nextWorkspaceId);
      }
    },
    [setWorkspaceId],
  );
  const contextValue = useMemo<WorkspaceContextValue>(
    () => ({
      activeWorkspace,
      setWorkspace,
      workspaces: availableWorkspaces,
    }),
    [activeWorkspace, availableWorkspaces, setWorkspace],
  );

  return <WorkspaceContext.Provider value={contextValue}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const contextValue = useContext(WorkspaceContext);
  if (!contextValue) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return contextValue;
}
