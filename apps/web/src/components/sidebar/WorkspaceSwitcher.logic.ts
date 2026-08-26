import type { WorkspaceId } from "../../workspace";

/**
 * Workspace-specific landing pages live at the index route. Avoid reloading
 * that route when it is already active because TanStack Router treats a
 * same-URL navigation as an explicit reload.
 */
export function shouldResetWorkspaceRoute(
  pathname: string,
  currentWorkspaceId: WorkspaceId,
  nextWorkspaceId: WorkspaceId,
): boolean {
  if (pathname === "/" || currentWorkspaceId === nextWorkspaceId) {
    return false;
  }

  return (
    nextWorkspaceId === "chat" ||
    nextWorkspaceId === "image" ||
    currentWorkspaceId === "chat" ||
    currentWorkspaceId === "image"
  );
}
