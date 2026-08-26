import {
  OpenRouterSettings,
  ProviderDriverKind,
  type ProviderInstanceId,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const OPENROUTER_DRIVER = ProviderDriverKind.make("openrouter");
const decodeOpenRouterSettings = Schema.decodeUnknownSync(OpenRouterSettings);

export interface OpenRouterConnection {
  readonly baseUrl: string;
  readonly apiKey: string;
}

function providerEnvironmentValue(
  environment: ReadonlyArray<{ readonly name: string; readonly value: string }> | undefined,
  name: string,
): string | undefined {
  return environment?.find((variable) => variable.name === name)?.value.trim() || undefined;
}

export function resolveOpenRouterConnection(
  settings: ServerSettings,
  requestedInstanceId: ProviderInstanceId | undefined,
): OpenRouterConnection {
  const entries = Object.entries(settings.providerInstances).filter(
    ([instanceId, instance]) =>
      instance.driver === OPENROUTER_DRIVER &&
      instance.enabled !== false &&
      (requestedInstanceId === undefined || instanceId === requestedInstanceId),
  );

  if (requestedInstanceId !== undefined && entries.length === 0) {
    throw new Error("The requested OpenRouter provider instance is not configured.");
  }
  const selected = entries[0]?.[1];
  const legacy = settings.providers.openrouter;
  const config = decodeOpenRouterSettings(selected?.config ?? legacy ?? {});
  const apiKey =
    providerEnvironmentValue(selected?.environment, "OPENROUTER_API_KEY") ??
    config.apiKey ??
    process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenRouter is not configured with an API key.");
  return { baseUrl: config.apiEndpoint, apiKey };
}

