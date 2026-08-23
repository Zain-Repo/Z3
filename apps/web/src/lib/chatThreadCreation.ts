import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

export const CHAT_ENVIRONMENT_STORAGE_KEY = "t3code:chat-environment";

export function readChatEnvironmentSelection(): string | null {
  return typeof window === "undefined"
    ? null
    : window.localStorage.getItem(CHAT_ENVIRONMENT_STORAGE_KEY);
}

export function writeChatEnvironmentSelection(environmentId: EnvironmentId): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CHAT_ENVIRONMENT_STORAGE_KEY, environmentId);
  }
}

interface ChatProviderModel {
  readonly slug: string;
  readonly isDefault?: boolean | undefined;
}

export interface ChatProviderCandidate {
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly instanceId: ProviderInstanceId;
  readonly models: readonly ChatProviderModel[];
}

export interface ChatModelSelection {
  readonly instanceId: ProviderInstanceId;
  readonly model: string;
}

export interface ChatThreadCleanupCandidate {
  readonly environmentId: EnvironmentId;
  readonly id: ThreadId;
  readonly scope?: "project" | "chat" | undefined;
  readonly projectId: string | null;
  readonly title: string;
  readonly latestUserMessageAt: string | null;
  readonly latestTurn: unknown | null;
  readonly createdAt: string;
}

/**
 * Finds only empty, default-titled chat threads, preserving one per
 * environment. A currently open thread wins over the newest-thread fallback.
 */
export function findDuplicateEmptyChatThreadIds(
  threads: readonly ChatThreadCleanupCandidate[],
  activeThreadId: ThreadId | null,
): ReadonlyArray<ThreadId> {
  const candidatesByEnvironment = new Map<EnvironmentId, ChatThreadCleanupCandidate[]>();
  for (const thread of threads) {
    if (
      thread.scope !== "chat" ||
      thread.projectId !== null ||
      thread.title !== "New chat" ||
      thread.latestUserMessageAt !== null ||
      thread.latestTurn !== null
    ) {
      continue;
    }
    const candidates = candidatesByEnvironment.get(thread.environmentId) ?? [];
    candidates.push(thread);
    candidatesByEnvironment.set(thread.environmentId, candidates);
  }

  const duplicateIds: ThreadId[] = [];
  for (const candidates of candidatesByEnvironment.values()) {
    if (candidates.length < 2) continue;
    candidates.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const preserved =
      candidates.find((thread) => thread.id === activeThreadId) ?? candidates[0]!;
    duplicateIds.push(
      ...candidates.filter((thread) => thread.id !== preserved.id).map((thread) => thread.id),
    );
  }
  return duplicateIds;
}

export function resolveChatModelSelection(
  providers: readonly ChatProviderCandidate[] | undefined,
): ChatModelSelection | null {
  const provider = providers?.find(
    (candidate) => candidate.enabled && candidate.installed && candidate.models.length > 0,
  );
  const model =
    provider?.models.find((candidate) => candidate.isDefault === true)?.slug ??
    provider?.models[0]?.slug;
  return provider && model ? { instanceId: provider.instanceId, model } : null;
}

export function buildChatThreadCreateInput(input: {
  readonly threadId: ThreadId;
  readonly selection: ChatModelSelection;
  readonly title?: string;
  readonly createdAt?: string;
}) {
  return {
    threadId: input.threadId,
    scope: "chat" as const,
    projectId: null,
    title: input.title ?? "New chat",
    modelSelection: input.selection,
    runtimeMode: "approval-required" as const,
    interactionMode: "default" as const,
    branch: null,
    worktreePath: null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function resolveChatEnvironmentId(
  selectedEnvironmentId: string | null,
  activeEnvironmentId: EnvironmentId | null,
  primaryEnvironmentId: EnvironmentId | null,
  availableEnvironmentIds: readonly EnvironmentId[],
): EnvironmentId | null {
  if (
    selectedEnvironmentId !== null &&
    availableEnvironmentIds.some((environmentId) => environmentId === selectedEnvironmentId)
  ) {
    return (
      availableEnvironmentIds.find((environmentId) => environmentId === selectedEnvironmentId) ??
      null
    );
  }
  return activeEnvironmentId ?? primaryEnvironmentId ?? availableEnvironmentIds[0] ?? null;
}
