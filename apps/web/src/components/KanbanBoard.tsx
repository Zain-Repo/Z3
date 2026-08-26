import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  Columns3Icon,
  FilterIcon,
  FlagIcon,
  GripVerticalIcon,
  InboxIcon,
  ListFilterIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState, type DragEvent, type FormEvent } from "react";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { SidebarInset } from "./ui/sidebar";
import { cn } from "../lib/utils";

type ColumnId = "backlog" | "in-progress" | "review" | "done";
type Priority = "low" | "medium" | "high";
type PriorityFilter = "all" | Priority;

type KanbanTask = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly project: string;
  readonly assignee: string;
  readonly initials: string;
  readonly tags: ReadonlyArray<string>;
  readonly priority: Priority;
  readonly estimate: string;
  readonly dueLabel?: string;
  readonly column: ColumnId;
};

const COLUMNS: ReadonlyArray<{
  readonly id: ColumnId;
  readonly label: string;
  readonly hint: string;
  readonly color: string;
}> = [
  { id: "backlog", label: "Backlog", hint: "Ideas and upcoming work", color: "bg-slate-400" },
  { id: "in-progress", label: "In progress", hint: "Currently being worked on", color: "bg-blue-500" },
  { id: "review", label: "Review", hint: "Ready for a second look", color: "bg-amber-500" },
  { id: "done", label: "Done", hint: "Shipped and wrapped up", color: "bg-emerald-500" },
];

const INITIAL_TASKS: ReadonlyArray<KanbanTask> = [
  {
    id: "task-1",
    title: "Polish the project switcher",
    description: "Tighten keyboard navigation and make the active project easier to scan.",
    project: "Z3Code",
    assignee: "You",
    initials: "YU",
    tags: ["UX", "Navigation"],
    priority: "high",
    estimate: "2h",
    dueLabel: "Today",
    column: "in-progress",
  },
  {
    id: "task-2",
    title: "Add provider health states",
    description: "Give each provider a compact status and a useful recovery path.",
    project: "Z3Code",
    assignee: "Maya",
    initials: "MA",
    tags: ["Providers"],
    priority: "medium",
    estimate: "3h",
    column: "review",
  },
  {
    id: "task-3",
    title: "Remote workspace onboarding",
    description: "Make the first remote connection feel clear, calm, and reversible.",
    project: "Connect",
    assignee: "Theo",
    initials: "TH",
    tags: ["Onboarding", "Remote"],
    priority: "high",
    estimate: "1d",
    dueLabel: "Fri",
    column: "backlog",
  },
  {
    id: "task-4",
    title: "Refresh empty project state",
    description: "Replace the dead end with a focused next step for new workspaces.",
    project: "Z3Code",
    assignee: "You",
    initials: "YU",
    tags: ["UX"],
    priority: "low",
    estimate: "1h",
    column: "done",
  },
  {
    id: "task-5",
    title: "Document provider capabilities",
    description: "Capture what each provider supports across local and remote sessions.",
    project: "Docs",
    assignee: "Maya",
    initials: "MA",
    tags: ["Docs", "Providers"],
    priority: "medium",
    estimate: "4h",
    column: "backlog",
  },
  {
    id: "task-6",
    title: "Reduce sidebar thread noise",
    description: "Clarify the active, snoozed, and settled thread treatments.",
    project: "Z3Code",
    assignee: "Theo",
    initials: "TH",
    tags: ["Performance", "UX"],
    priority: "medium",
    estimate: "2h",
    column: "in-progress",
  },
  {
    id: "task-7",
    title: "Keyboard shortcut audit",
    description: "Verify the command palette and navigation shortcuts share one vocabulary.",
    project: "Z3Code",
    assignee: "You",
    initials: "YU",
    tags: ["Accessibility"],
    priority: "low",
    estimate: "2h",
    column: "done",
  },
];

const PRIORITY_STYLES: Record<Priority, { readonly label: string; readonly className: string }> = {
  low: { label: "Low", className: "text-muted-foreground" },
  medium: { label: "Medium", className: "text-amber-600 dark:text-amber-400" },
  high: { label: "High", className: "text-rose-600 dark:text-rose-400" },
};

function formatTaskCount(count: number): string {
  return `${count} ${count === 1 ? "task" : "tasks"}`;
}

function TaskTile({ task, onDragStart }: { readonly task: KanbanTask; readonly onDragStart: (id: string) => void }) {
  const priority = PRIORITY_STYLES[task.priority];

  return (
    <article
      draggable
      onDragStart={() => onDragStart(task.id)}
      className="group relative cursor-grab border border-border/70 bg-background/75 p-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-border hover:shadow-md active:cursor-grabbing active:translate-y-0"
    >
      <div className="mb-2 flex items-start gap-2">
        <GripVerticalIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/65" />
        <h3 className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-foreground">
          {task.title}
        </h3>
        <button
          type="button"
          aria-label={`More actions for ${task.title}`}
          className="size-5 shrink-0 text-center text-sm leading-3 text-muted-foreground/45 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        >
          ···
        </button>
      </div>
      <p className="mb-3 line-clamp-2 pl-5 text-[11px] leading-relaxed text-muted-foreground/80">
        {task.description}
      </p>
      <div className="mb-3 flex flex-wrap gap-1 pl-5">
        {task.tags.map((tag) => (
          <Badge key={tag} variant="outline" size="sm" className="border-border/70 bg-muted/35 text-[10px] font-medium text-muted-foreground">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/55 pt-2.5 pl-5 text-[10px] text-muted-foreground/70">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[9px] font-semibold text-blue-600 dark:text-blue-300">
            {task.initials}
          </span>
          <span className="truncate">{task.assignee}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 font-medium", priority.className)}>
            <FlagIcon className="size-3" />
            {priority.label}
          </span>
          <span>{task.estimate}</span>
          {task.dueLabel ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CalendarDaysIcon className="size-3" />
              {task.dueLabel}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function BoardColumn({
  column,
  tasks,
  onDragStart,
  onDrop,
  onAddTask,
}: {
  readonly column: (typeof COLUMNS)[number];
  readonly tasks: ReadonlyArray<KanbanTask>;
  readonly onDragStart: (id: string) => void;
  readonly onDrop: (columnId: ColumnId) => void;
  readonly onAddTask: (columnId: ColumnId) => void;
}) {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsOver(true);
  };

  return (
    <section
      onDragOver={handleDragOver}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsOver(false);
        onDrop(column.id);
      }}
      className={cn(
        "flex min-h-[24rem] min-w-[17rem] flex-1 flex-col bg-muted/18 transition-colors",
        isOver && "bg-blue-500/[0.055]",
      )}
    >
      <div className="flex items-start justify-between border-b border-border/60 px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <span className={cn("mt-1.5 size-2 rounded-full", column.color)} aria-hidden="true" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-foreground">{column.label}</h2>
              <span className="text-[11px] tabular-nums text-muted-foreground/65">{tasks.length}</span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground/65">{column.hint}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={`Add task to ${column.label}`}
          onClick={() => onAddTask(column.id)}
          className="inline-flex size-6 items-center justify-center text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        {tasks.map((task) => (
          <TaskTile key={task.id} task={task} onDragStart={onDragStart} />
        ))}
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center border border-dashed border-border/65 px-4 py-10 text-center text-[11px] text-muted-foreground/60">
            Drop work here
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function KanbanBoard() {
  const [tasks, setTasks] = useState<ReadonlyArray<KanbanTask>>(INITIAL_TASKS);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [newTaskColumn, setNewTaskColumn] = useState<ColumnId | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesQuery =
        query.length === 0 ||
        [task.title, task.description, task.project, ...task.tags].some((value) =>
          value.toLowerCase().includes(query),
        );
      return matchesQuery && (priorityFilter === "all" || task.priority === priorityFilter);
    });
  }, [priorityFilter, searchQuery, tasks]);

  const completedCount = tasks.filter((task) => task.column === "done").length;
  const activeCount = tasks.filter((task) => task.column === "in-progress").length;

  const moveTask = (column: ColumnId) => {
    if (activeDragId === null) return;
    setTasks((current) =>
      current.map((task) => (task.id === activeDragId ? { ...task, column } : task)),
    );
    setActiveDragId(null);
  };

  const openNewTask = (column: ColumnId = "backlog") => {
    setNewTaskColumn(column);
    setNewTaskTitle("");
  };

  const submitNewTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || newTaskColumn === null) return;
    const task: KanbanTask = {
      id: `task-${Date.now()}`,
      title,
      description: "A new piece of work ready to be shaped.",
      project: "Z3Code",
      assignee: "You",
      initials: "YU",
      tags: ["New"],
      priority: "medium",
      estimate: "—",
      column: newTaskColumn,
    };
    setTasks((current) => [task, ...current]);
    setNewTaskColumn(null);
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border/65 bg-background/90 px-5 py-4 backdrop-blur sm:px-7 lg:px-9">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center bg-blue-500/10 text-blue-600 dark:text-blue-300">
                <Columns3Icon className="size-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-base font-semibold tracking-[-0.02em]">Kanban</h1>
                  <Badge variant="outline" size="sm" className="border-blue-500/25 bg-blue-500/[0.06] text-blue-600 dark:text-blue-300">
                    Preview
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground/75">A focused view of the work moving through Z3Code.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="hidden gap-2 sm:inline-flex">
                <SparklesIcon className="size-3.5" />
                Focus mode
              </Button>
              <Button type="button" size="sm" className="gap-2" onClick={() => openNewTask()}>
                <PlusIcon className="size-3.5" />
                Add task
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.045),transparent_30rem)] px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
            <div className="grid grid-cols-2 gap-px overflow-hidden border border-border/60 bg-border/60 sm:grid-cols-4">
              {[
                ["Total work", tasks.length, "Across this board"],
                ["In progress", activeCount, "Moving right now"],
                ["Completed", completedCount, "Ready to celebrate"],
                ["Cycle focus", "This week", "Keep the queue clear"],
              ].map(([label, value, hint]) => (
                <div key={String(label)} className="bg-background px-4 py-3.5 sm:px-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/65">{label}</p>
                  <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-foreground">{value}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/65">{hint}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/75">
                <ListFilterIcon className="size-3.5" />
                <span>Showing {formatTaskCount(filteredTasks.length)}</span>
                {searchQuery || priorityFilter !== "all" ? <span className="text-muted-foreground/50">with filters</span> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-8 items-center gap-2 border border-border/70 bg-background px-2.5 text-muted-foreground/75 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
                  <SearchIcon className="size-3.5 shrink-0" />
                  <Input
                    nativeInput
                    unstyled
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.currentTarget.value)}
                    placeholder="Search tasks"
                    aria-label="Search tasks"
                    className="w-32 min-w-0 [&_[data-slot=input]]:h-auto [&_[data-slot=input]]:p-0 [&_[data-slot=input]]:text-xs sm:w-44"
                  />
                  {searchQuery ? (
                    <button type="button" aria-label="Clear task search" onClick={() => setSearchQuery("")} className="text-muted-foreground/60 hover:text-foreground">
                      <XIcon className="size-3" />
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 border border-border/70 bg-background p-1">
                  <FilterIcon className="mx-1 size-3.5 text-muted-foreground/65" />
                  {(["all", "high", "medium", "low"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setPriorityFilter(filter)}
                      className={cn(
                        "px-2 py-1 text-[10px] font-medium capitalize transition-colors",
                        priorityFilter === filter ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {filter === "all" ? "All" : filter}
                    </button>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="hidden gap-1.5 md:inline-flex">
                  <InboxIcon className="size-3.5" />
                  My tasks
                  <ChevronDownIcon className="size-3" />
                </Button>
              </div>
            </div>

            <div className="grid min-w-0 gap-3 overflow-x-auto pb-2 xl:grid-cols-4">
              {COLUMNS.map((column) => (
                <BoardColumn
                  key={column.id}
                  column={column}
                  tasks={filteredTasks.filter((task) => task.column === column.id)}
                  onDragStart={setActiveDragId}
                  onDrop={moveTask}
                  onAddTask={openNewTask}
                />
              ))}
            </div>
            <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-[10px] text-muted-foreground/55">
              <ArrowUpIcon className="size-3" /> Drag a task between columns to update its status
              <ArrowDownIcon className="size-3" />
            </p>
          </div>
        </main>
      </div>

      <Dialog open={newTaskColumn !== null} onOpenChange={(open) => !open && setNewTaskColumn(null)}>
        <DialogPopup className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a task</DialogTitle>
            <DialogDescription>Capture the next piece of work. It will stay local until Kanban is connected to the backend.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitNewTask}>
            <DialogPanel className="space-y-4">
              <label className="block space-y-1.5 text-sm font-medium">
                Task name
                <Input autoFocus value={newTaskTitle} onValueChange={setNewTaskTitle} placeholder="What needs to move forward?" />
              </label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground/75">
                <CircleDashedIcon className="size-3.5" />
                Starting in {COLUMNS.find((column) => column.id === newTaskColumn)?.label ?? "Backlog"}
                <UserRoundIcon className="ml-2 size-3.5" />
                Assigned to you
              </div>
            </DialogPanel>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setNewTaskColumn(null)}>Cancel</Button>
              <Button type="submit" disabled={!newTaskTitle.trim()}><CheckIcon className="size-3.5" /> Add task</Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}
