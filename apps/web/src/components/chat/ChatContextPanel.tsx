import type { EnvironmentId } from "@t3tools/contracts";
import { Settings2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ChatProject } from "../../lib/chatProjects";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { ChatProjectDialog } from "../ChatProjectDialog";
import { ChatProjectContentTabs, type ChatProjectSourceActionHandlers } from "../ChatProjectHero";
import { Button } from "../ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../ui/tabs";
import { Sheet, SheetPopup, SheetTitle } from "../ui/sheet";

interface ChatContextPanelProps extends ChatProjectSourceActionHandlers {
  readonly environmentId: EnvironmentId;
  readonly project: ChatProject;
  readonly onClose: () => void;
}

/** Inspect project configuration without representing it as a record of model retrieval. */
export function ChatContextPanel({
  environmentId,
  project,
  onClose,
  onReindexSource,
  onDeleteSource,
}: ChatContextPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const useSheet = useMediaQuery("max-xl");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!useSheet) closeButtonRef.current?.focus();
  }, [useSheet]);

  const content = (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-medium">Project context</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{project.name}</p>
        </div>
        <Button
          ref={closeButtonRef}
          variant="ghost"
          size="icon"
          aria-label="Close project context"
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <Tabs defaultValue="sources" className="min-h-0 flex-1 gap-0">
        <TabsList variant="underline" className="mx-5 shrink-0" aria-label="Project context views">
          <TabsTab value="sources">
            Sources <span className="text-muted-foreground">{project.sources.length}</span>
          </TabsTab>
          <TabsTab value="instructions">Instructions</TabsTab>
          <TabsTab value="memory">Memory</TabsTab>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <TabsPanel value="sources">
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              Reference files available to this project. Preview their contents or manage their
              index.
            </p>
            <ChatProjectContentTabs
              sourcesOnly
              environmentId={environmentId}
              projectId={project.id}
              recentThreads={[]}
              sources={project.sources}
              onSelectThread={() => undefined}
              {...(onReindexSource ? { onReindexSource } : {})}
              {...(onDeleteSource ? { onDeleteSource } : {})}
            />
          </TabsPanel>
          <TabsPanel value="instructions">
            <h3 className="mb-2 text-sm font-medium">Custom instructions</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              Included when sending a message in this project.
            </p>
            <div className="whitespace-pre-wrap break-words text-sm leading-7">
              {project.instructions.trim() ||
                "No project instructions yet. Add preferences, goals, or guidance in project settings."}
            </div>
          </TabsPanel>
          <TabsPanel value="memory">
            <h3 className="mb-2 text-sm font-medium">
              {project.memoryMode === "full" ? "Full memory" : "Project-only memory"}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {project.memoryMode === "full"
                ? "Configured to search relevant conversations across all Z3Chat projects."
                : "Configured to search relevant conversations from this project only."}
            </p>
            <p className="mt-5 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
              This is your configured memory scope. Retrieved conversation excerpts and per-answer
              memory usage are not available in this view.
            </p>
          </TabsPanel>
        </div>
      </Tabs>
      <div className="border-t border-border px-5 py-4">
        <Button variant="outline" className="w-full" onClick={() => setSettingsOpen(true)}>
          <Settings2Icon aria-hidden="true" /> Edit project settings
        </Button>
      </div>
      <ChatProjectDialog
        environmentId={environmentId}
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onCreated={() => undefined}
      />
    </>
  );

  return useSheet ? (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetPopup
        id="chat-project-context"
        showCloseButton={false}
        className="w-full max-w-md motion-reduce:transition-none"
      >
        <SheetTitle className="sr-only">Project context</SheetTitle>
        {content}
      </SheetPopup>
    </Sheet>
  ) : (
    <aside
      id="chat-project-context"
      aria-label="Project context"
      className="order-last flex min-h-0 w-96 shrink-0 flex-col border-l border-border bg-background"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !settingsOpen) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {content}
    </aside>
  );
}
