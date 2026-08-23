import type {
  ModelSelection,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerConfig,
} from "@t3tools/contracts";

import { getTriggerDisplayModelLabel } from "../components/chat/providerIconUtils";
import { deriveProviderInstanceEntries } from "../providerInstances";
import { formatProviderDisplayName } from "./contextWindow";

export interface ChatSidebarProviderPresentationInput {
  readonly modelSelection: ModelSelection | null | undefined;
  readonly serverConfig: Pick<ServerConfig, "providers"> | null | undefined;
}

export interface ChatSidebarProviderPresentation {
  readonly providerDisplayName: string;
  readonly modelLabel: string;
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: ProviderDriverKind | null;
}

/**
 * Resolve the provider instance and model labels for a persisted chat
 * selection. Provider snapshots are intentionally optional: a thread can
 * outlive a removed provider instance or be opened while its environment is
 * still loading.
 */
export function resolveChatSidebarProviderPresentation(
  input: ChatSidebarProviderPresentationInput,
): ChatSidebarProviderPresentation | null {
  const selection = input.modelSelection;
  if (!selection) return null;

  const entries = input.serverConfig
    ? deriveProviderInstanceEntries(input.serverConfig.providers)
    : [];
  const entry = entries.find((candidate) => candidate.instanceId === selection.instanceId);
  const model = entry?.models.find((candidate) => candidate.slug === selection.model);

  return {
    providerDisplayName: entry?.displayName ?? formatProviderDisplayName(selection.instanceId),
    modelLabel: model ? getTriggerDisplayModelLabel(model) : selection.model,
    instanceId: selection.instanceId,
    driverKind: entry?.driverKind ?? null,
  };
}
