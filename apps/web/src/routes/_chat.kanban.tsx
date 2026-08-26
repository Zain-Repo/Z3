import { createFileRoute } from "@tanstack/react-router";

import KanbanBoard from "../components/KanbanBoard";

export const Route = createFileRoute("/_chat/kanban")({
  component: KanbanBoard,
});
