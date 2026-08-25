import {
  DeepSeekSettings,
  ProviderDriverKind,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as HttpClient from "effect/unstable/http/HttpClient";

import {
  DeepSeekApiError,
  fetchDeepSeekModels,
  type DeepSeekModel,
} from "./DeepSeekApi.ts";
import {
  buildServerProvider,
  providerModelsFromSettings,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const DRIVER_KIND = ProviderDriverKind.make("deepseek");

function modelsFromApi(
  models: ReadonlyArray<DeepSeekModel>,
  settings: DeepSeekSettings,
): ReadonlyArray<ServerProviderModel> {
  const defaultModel = settings.defaultModel;
  const builtIn = models.map((model) => ({
    slug: model.id,
    name: model.name ?? model.id,
    isCustom: false,
    ...(model.id === defaultModel ? { isDefault: true } : {}),
    capabilities: null,
  }));
  return providerModelsFromSettings(builtIn, settings.customModels, {});
}

function fallbackModels(settings: DeepSeekSettings): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings([], [settings.defaultModel, ...settings.customModels], {});
}

function snapshot(input: {
  readonly settings: DeepSeekSettings;
  readonly enabled: boolean;
  readonly models: ReadonlyArray<ServerProviderModel>;
  readonly status: "ready" | "warning" | "error";
  readonly auth: "authenticated" | "unauthenticated" | "unknown";
  readonly checkedAt: string;
  readonly message?: string;
}): ServerProviderDraft {
  return buildServerProvider({
    driver: DRIVER_KIND,
    presentation: {
      displayName: "DeepSeek",
      showInteractionModeToggle: false,
      requiresNewThreadForModelChange: false,
    },
    enabled: input.enabled,
    checkedAt: input.checkedAt,
    models: input.models,
    probe: {
      installed: true,
      version: null,
      status: input.status,
      auth: { status: input.auth, type: "api-key", label: "DeepSeek API key" },
      ...(input.message ? { message: input.message } : {}),
    },
  });
}

export function makePendingDeepSeekProvider(
  settings: DeepSeekSettings,
  enabled: boolean,
): Effect.Effect<ServerProviderDraft> {
  return DateTime.now.pipe(
    Effect.map((now) =>
      snapshot({
        settings,
        enabled,
        models: fallbackModels(settings),
        status: "warning",
        auth: "unknown",
        checkedAt: DateTime.formatIso(now),
        message: "DeepSeek status has not been checked yet.",
      }),
    ),
  );
}

export function checkDeepSeekProvider(
  settings: DeepSeekSettings,
  enabled: boolean,
  apiKey: string | undefined,
  httpClient?: HttpClient.HttpClient,
): Effect.Effect<ServerProviderDraft> {
  if (!apiKey) {
    return DateTime.now.pipe(
      Effect.map((now) =>
        snapshot({
          settings,
          enabled,
          models: fallbackModels(settings),
          status: "warning",
          auth: "unauthenticated",
          checkedAt: DateTime.formatIso(now),
          message:
            "Enter a DeepSeek API key in this provider instance's settings, or set DEEPSEEK_API_KEY in its environment variables.",
        }),
      ),
    );
  }

  if (!httpClient) {
    return DateTime.now.pipe(
      Effect.map((now) =>
        snapshot({
          settings,
          enabled,
          models: fallbackModels(settings),
          status: "error",
          auth: "unknown",
          checkedAt: DateTime.formatIso(now),
          message: "DeepSeek HTTP client is unavailable.",
        }),
      ),
    );
  }

  return fetchDeepSeekModels(httpClient, settings.apiEndpoint, apiKey).pipe(
    Effect.flatMap((models) =>
      DateTime.now.pipe(
        Effect.map((now) =>
          snapshot({
            settings,
            enabled,
            models: modelsFromApi(models, settings),
            status: "ready",
            auth: "authenticated",
            checkedAt: DateTime.formatIso(now),
          }),
        ),
      ),
    ),
    Effect.catch((cause: unknown) =>
      DateTime.now.pipe(
        Effect.map((now) =>
          snapshot({
            settings,
            enabled,
            models: fallbackModels(settings),
            status: "error",
            auth:
              cause instanceof DeepSeekApiError && cause.status === 401
                ? "unauthenticated"
                : "unknown",
            checkedAt: DateTime.formatIso(now),
            message: cause instanceof Error ? cause.message : "DeepSeek status check failed.",
          }),
        ),
      ),
    ),
  );
}

export function stampDeepSeekIdentity(input: {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string | undefined;
  readonly accentColor: string | undefined;
  readonly continuationGroupKey: string;
}) {
  return (provider: ServerProviderDraft): ServerProvider => ({
    ...provider,
    instanceId: input.instanceId,
    driver: DRIVER_KIND,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.accentColor ? { accentColor: input.accentColor } : {}),
    continuation: { groupKey: input.continuationGroupKey },
  });
}
