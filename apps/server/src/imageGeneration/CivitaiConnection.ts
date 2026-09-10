import type { ProviderInstanceId, ServerSettings } from "@t3tools/contracts";

/** Resolves credentials only from the protected environment of a Civitai instance. */
export function resolveCivitaiApiKey(
  settings: ServerSettings,
  instanceId: ProviderInstanceId,
): string | undefined {
  const instance = settings.providerInstances[instanceId];
  if (!instance || instance.driver !== "civitai" || instance.enabled === false) return undefined;
  return (
    instance.environment?.find((entry) => entry.name === "CIVITAI_API_KEY")?.value.trim() ||
    undefined
  );
}
