import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { FolderIcon, MoreHorizontalIcon, PinIcon, PinOffIcon, Settings2Icon } from "lucide-react";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import type { ThreadShell } from "../types";
import type { ChatProject } from "../lib/chatProjects";
import { ChatProjectDialog } from "./ChatProjectDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/menu";

interface ChatProjectHeroProps {
  readonly environmentId: EnvironmentId;
  readonly project: ChatProject;
  readonly recentThreads: readonly ThreadShell[];
  readonly onTogglePin: () => void;
  readonly onSelectThread: (environmentId: EnvironmentId, threadId: ThreadId) => void;
}

function formatRecentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function ChatProjectHero({
  environmentId,
  project,
  recentThreads,
  onTogglePin,
  onSelectThread,
}: ChatProjectHeroProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isReducedMotion = useReducedMotion() ?? false;

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-1 sm:px-2">
      <div className="mb-7 flex items-center justify-between gap-4 px-1 sm:px-2">
        <motion.div
          className="flex min-w-0 items-center gap-3"
          initial={isReducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={isReducedMotion ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
        >
          <FolderIcon className="size-7 shrink-0 text-foreground/80" strokeWidth={1.8} />
          <h1 className="min-w-0 truncate text-2xl font-medium tracking-tight text-foreground sm:text-[28px]">
            {project.name}
          </h1>
        </motion.div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/65 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Actions for ${project.name}`}
          >
            <MoreHorizontalIcon className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <Settings2Icon />
              Project settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePin}>
              {project.isPinned ? <PinOffIcon /> : <PinIcon />}
              {project.isPinned ? "Unpin project" : "Pin project"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {recentThreads.length > 0 ? (
        <section aria-labelledby="recent-project-chats-heading" className="px-1 sm:px-2">
          <h2
            id="recent-project-chats-heading"
            className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/70"
          >
            Recent chats
          </h2>
          <div className="divide-y divide-border/70 border-y border-border/70">
            {recentThreads.map((thread) => (
              <button
                key={`${environmentId}:${thread.id}`}
                type="button"
                className="flex min-h-16 w-full items-center gap-3 py-3 text-left outline-none transition-colors hover:text-foreground focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => onSelectThread(environmentId, thread.id)}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
                  {thread.title || "New chat"}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRecentDate(thread.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      </div>
      <ChatProjectDialog
        environmentId={environmentId}
        onCreated={() => undefined}
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        project={project}
      />
    </>
  );
}
