import { createFileRoute, Navigate } from "@tanstack/react-router";

import { ChatLibraryPage } from "../components/ChatLibraryPage";
import { useWorkspace } from "../workspace";

function LibraryRoute() {
  const { activeWorkspace } = useWorkspace();
  return activeWorkspace.id === "chat" ? <ChatLibraryPage /> : <Navigate to="/" replace />;
}

export const Route = createFileRoute("/_chat/library")({ component: LibraryRoute });
