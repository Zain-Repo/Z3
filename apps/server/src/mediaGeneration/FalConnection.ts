import { ProviderInstanceId, type ServerSettings } from "@t3tools/contracts";

/** Media credentials stay in the environment's existing protected provider settings. */
export function resolveFalApiKey(
  settings: ServerSettings,
  instanceId: ProviderInstanceId = ProviderInstanceId.make("fal"),
): string | undefined {
  const instance = settings.providerInstances[instanceId];
  if (!instance || instance.driver !== "fal" || instance.enabled === false) return undefined;
  return instance.environment?.find((entry) => entry.name === "FAL_KEY")?.value.trim() || undefined;
}
