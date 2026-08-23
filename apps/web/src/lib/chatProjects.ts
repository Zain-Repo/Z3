import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

const CHAT_PROJECTS_STORAGE_KEY = "z3chat:projects:v1";
const MAX_PROJECTS_PER_ENVIRONMENT = 50;
const MAX_SOURCES_PER_PROJECT = 30;
const MAX_SOURCE_BYTES = 250_000;
const MAX_TOTAL_SOURCE_BYTES = 1_500_000;
const MAX_CONTEXT_CHARS = 120_000;

export interface ChatProjectSource {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly contents: string;
  readonly createdAt: string;
}

export interface ChatProject {
  readonly id: string;
  readonly name: string;
  readonly instructions: string;
  readonly sources: readonly ChatProjectSource[];
  readonly threadIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ChatProjectsState {
  readonly projectsByEnvironment: Readonly<Record<string, readonly ChatProject[]>>;
  readonly activeProjectIdByEnvironment: Readonly<Record<string, string | null>>;
  readonly createProject: (environmentId: EnvironmentId, name: string) => string | null;
  readonly updateProject: (
    environmentId: EnvironmentId,
    projectId: string,
    patch: { readonly name?: string; readonly instructions?: string },
  ) => void;
  readonly deleteProject: (environmentId: EnvironmentId, projectId: string) => void;
  readonly addSource: (
    environmentId: EnvironmentId,
    projectId: string,
    source: Omit<ChatProjectSource, "id" | "createdAt">,
  ) => string | null;
  readonly removeSource: (
    environmentId: EnvironmentId,
    projectId: string,
    sourceId: string,
  ) => void;
  readonly setActiveProject: (environmentId: EnvironmentId, projectId: string | null) => void;
  readonly addThreadToProject: (
    environmentId: EnvironmentId,
    projectId: string,
    threadId: ThreadId,
  ) => void;
}

const EMPTY_PROJECTS: readonly ChatProject[] = [];

function now(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function sanitizeSource(value: unknown): ChatProjectSource | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id).trim();
  const name = stringValue(value.name).trim();
  const contents = stringValue(value.contents);
  if (!id || !name || contents.length > MAX_SOURCE_BYTES) return null;
  return {
    id,
    name,
    mimeType: stringValue(value.mimeType, "text/plain"),
    sizeBytes: nonNegativeNumber(value.sizeBytes),
    contents,
    createdAt: stringValue(value.createdAt, now()),
  };
}

function sanitizeProject(value: unknown): ChatProject | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id).trim();
  const name = stringValue(value.name).trim();
  if (!id || !name) return null;
  const sources = Array.isArray(value.sources)
    ? value.sources
        .map(sanitizeSource)
        .filter((source): source is ChatProjectSource => source !== null)
    : [];
  const threadIds = Array.isArray(value.threadIds)
    ? [
        ...new Set(
          value.threadIds.filter((threadId): threadId is string => typeof threadId === "string"),
        ),
      ]
    : [];
  return {
    id,
    name,
    instructions: stringValue(value.instructions),
    sources: sources.slice(0, MAX_SOURCES_PER_PROJECT),
    threadIds,
    createdAt: stringValue(value.createdAt, now()),
    updatedAt: stringValue(value.updatedAt, now()),
  };
}

function readPersistedState(): Pick<
  ChatProjectsState,
  "projectsByEnvironment" | "activeProjectIdByEnvironment"
> {
  if (typeof window === "undefined") {
    return { projectsByEnvironment: {}, activeProjectIdByEnvironment: {} };
  }
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(CHAT_PROJECTS_STORAGE_KEY) ?? "{}",
    );
    if (!isRecord(parsed)) return { projectsByEnvironment: {}, activeProjectIdByEnvironment: {} };
    const projectsByEnvironment: Record<string, readonly ChatProject[]> = {};
    if (isRecord(parsed.projectsByEnvironment)) {
      for (const [environmentId, value] of Object.entries(parsed.projectsByEnvironment)) {
        if (!Array.isArray(value)) continue;
        const projects = value
          .map(sanitizeProject)
          .filter((project): project is ChatProject => project !== null)
          .slice(0, MAX_PROJECTS_PER_ENVIRONMENT);
        if (projects.length > 0) projectsByEnvironment[environmentId] = projects;
      }
    }
    const activeProjectIdByEnvironment: Record<string, string | null> = {};
    if (isRecord(parsed.activeProjectIdByEnvironment)) {
      for (const [environmentId, value] of Object.entries(parsed.activeProjectIdByEnvironment)) {
        activeProjectIdByEnvironment[environmentId] = typeof value === "string" ? value : null;
      }
    }
    return { projectsByEnvironment, activeProjectIdByEnvironment };
  } catch {
    return { projectsByEnvironment: {}, activeProjectIdByEnvironment: {} };
  }
}

function persistState(
  state: Pick<ChatProjectsState, "projectsByEnvironment" | "activeProjectIdByEnvironment">,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAT_PROJECTS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full or unavailable localStorage should not interrupt chat use.
  }
}

function updateEnvironmentProjects(
  state: ChatProjectsState,
  environmentId: EnvironmentId,
  update: (projects: readonly ChatProject[]) => readonly ChatProject[],
) {
  const current = state.projectsByEnvironment[environmentId] ?? EMPTY_PROJECTS;
  const nextProjectsByEnvironment = {
    ...state.projectsByEnvironment,
    [environmentId]: update(current),
  };
  const nextState = { ...state, projectsByEnvironment: nextProjectsByEnvironment };
  persistState(nextState);
  return nextState;
}

const persistedState = readPersistedState();

export const useChatProjectsStore = create<ChatProjectsState>((set) => ({
  ...persistedState,
  createProject: (environmentId, rawName) => {
    const name = rawName.trim();
    if (!name) return null;
    let projectId: string | null = null;
    set((state) => {
      const current = state.projectsByEnvironment[environmentId] ?? EMPTY_PROJECTS;
      if (current.length >= MAX_PROJECTS_PER_ENVIRONMENT) return state;
      projectId = createId("chat-project");
      const timestamp = now();
      const project: ChatProject = {
        id: projectId,
        name,
        instructions: "",
        sources: [],
        threadIds: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const nextState = {
        ...state,
        projectsByEnvironment: {
          ...state.projectsByEnvironment,
          [environmentId]: [project, ...current],
        },
        activeProjectIdByEnvironment: {
          ...state.activeProjectIdByEnvironment,
          [environmentId]: projectId,
        },
      };
      persistState(nextState);
      return nextState;
    });
    return projectId;
  },
  updateProject: (environmentId, projectId, patch) => {
    set((state) =>
      updateEnvironmentProjects(state, environmentId, (projects) =>
        projects.map((project) =>
          project.id !== projectId
            ? project
            : {
                ...project,
                ...(patch.name !== undefined && patch.name.trim()
                  ? { name: patch.name.trim() }
                  : {}),
                ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
                updatedAt: now(),
              },
        ),
      ),
    );
  },
  deleteProject: (environmentId, projectId) => {
    set((state) => {
      const nextState = updateEnvironmentProjects(state, environmentId, (projects) =>
        projects.filter((project) => project.id !== projectId),
      );
      if (nextState.activeProjectIdByEnvironment[environmentId] !== projectId) return nextState;
      const activeProjectIdByEnvironment = {
        ...nextState.activeProjectIdByEnvironment,
        [environmentId]: null,
      };
      const finalState = { ...nextState, activeProjectIdByEnvironment };
      persistState(finalState);
      return finalState;
    });
  },
  addSource: (environmentId, projectId, source) => {
    if (!source.name.trim() || source.contents.length > MAX_SOURCE_BYTES) return null;
    let sourceId: string | null = null;
    set((state) => {
      const timestamp = now();
      const nextState = updateEnvironmentProjects(state, environmentId, (projects) =>
        projects.map((project) => {
          if (project.id !== projectId || project.sources.length >= MAX_SOURCES_PER_PROJECT) {
            return project;
          }
          const currentBytes = project.sources.reduce((total, entry) => total + entry.sizeBytes, 0);
          if (currentBytes + source.sizeBytes > MAX_TOTAL_SOURCE_BYTES) return project;
          sourceId = createId("chat-source");
          return {
            ...project,
            sources: [
              ...project.sources,
              { ...source, id: sourceId, name: source.name.trim(), createdAt: timestamp },
            ],
            updatedAt: timestamp,
          };
        }),
      );
      persistState(nextState);
      return nextState;
    });
    return sourceId;
  },
  removeSource: (environmentId, projectId, sourceId) => {
    set((state) =>
      updateEnvironmentProjects(state, environmentId, (projects) =>
        projects.map((project) =>
          project.id !== projectId
            ? project
            : {
                ...project,
                sources: project.sources.filter((source) => source.id !== sourceId),
                updatedAt: now(),
              },
        ),
      ),
    );
  },
  setActiveProject: (environmentId, projectId) => {
    set((state) => {
      const nextState = {
        ...state,
        activeProjectIdByEnvironment: {
          ...state.activeProjectIdByEnvironment,
          [environmentId]: projectId,
        },
      };
      persistState(nextState);
      return nextState;
    });
  },
  addThreadToProject: (environmentId, projectId, threadId) => {
    set((state) =>
      updateEnvironmentProjects(state, environmentId, (projects) =>
        projects.map((project) =>
          project.id !== projectId || project.threadIds.includes(threadId)
            ? project
            : { ...project, threadIds: [...project.threadIds, threadId], updatedAt: now() },
        ),
      ),
    );
  },
}));

export function buildChatProjectContext(project: ChatProject): string {
  const sections: string[] = [
    `You are working inside the Z3Chat project “${project.name}”.`,
    "Apply the project instructions below when they are relevant to the user's request.",
  ];
  if (project.instructions.trim()) {
    sections.push(
      `<project-instructions>\n${project.instructions.trim()}\n</project-instructions>`,
    );
  }
  if (project.sources.length > 0) {
    sections.push(
      [
        "Use these project sources as reference material. Do not invent details that are not supported by them.",
        ...project.sources.map(
          (source) => `<source name="${source.name}">\n${source.contents}\n</source>`,
        ),
      ].join("\n"),
    );
  }
  const context = sections.join("\n\n");
  return context.length <= MAX_CONTEXT_CHARS
    ? context
    : `${context.slice(0, MAX_CONTEXT_CHARS)}\n[Additional project context omitted due to the chat context limit.]`;
}

export function projectForChatThread(
  projects: readonly ChatProject[],
  threadId: string,
): ChatProject | null {
  return projects.find((project) => project.threadIds.includes(threadId)) ?? null;
}

export function isSupportedChatProjectSource(file: Pick<File, "name" | "type" | "size">): boolean {
  if (file.size > MAX_SOURCE_BYTES) return false;
  if (file.type.startsWith("text/")) return true;
  return /\.(c|cc|cpp|css|csv|go|html?|java|js|json|jsx|md|mjs|py|rb|rs|sql|sh|toml|ts|tsx|txt|xml|yaml|yml)$/i.test(
    file.name,
  );
}

export const CHAT_PROJECT_SOURCE_MAX_BYTES = MAX_SOURCE_BYTES;
