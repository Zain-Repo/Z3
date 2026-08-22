import { OpenRouterSettings, ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient } from "effect/unstable/http";

import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { makeOpenRouterTextGeneration } from "../../textGeneration/OpenRouterTextGeneration.ts";
import { ProviderDriverError } from "../Errors.ts";
import { makeOpenRouterAdapter } from "../Layers/OpenRouterAdapter.ts";
import {
  checkOpenRouterProvider,
  makePendingOpenRouterProvider,
  stampOpenRouterIdentity,
} from "../Layers/OpenRouterProvider.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import { makeManualOnlyProviderMaintenanceCapabilities } from "../providerMaintenance.ts";

const DRIVER_KIND = ProviderDriverKind.make("openrouter");
const decodeOpenRouterSettings = Schema.decodeSync(OpenRouterSettings);

export type OpenRouterDriverEnv =
  | BackgroundPolicy.BackgroundPolicy
  | HttpClient.HttpClient
  | ServerSettingsService;

export const OpenRouterDriver: ProviderDriver<OpenRouterSettings, OpenRouterDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: { displayName: "OpenRouter", supportsMultipleInstances: true },
  configSchema: OpenRouterSettings,
  defaultConfig: () => decodeOpenRouterSettings({}),
  create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
    Effect.gen(function* () {
      const processEnv = mergeProviderInstanceEnvironment(environment);
      const httpClient = yield* HttpClient.HttpClient;
      const apiKey = processEnv.OPENROUTER_API_KEY?.trim() || undefined;
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });
      const identity = stampOpenRouterIdentity({
        instanceId,
        displayName,
        accentColor,
        continuationGroupKey: continuationIdentity.continuationKey,
      });
      // API keys are owned by the protected provider environment. Keep the
      // decoded config value blank even if an older/manual settings file has
      // one, so provider snapshots never expose credentials to clients.
      const effectiveConfig = { ...config, apiKey: "", enabled } satisfies OpenRouterSettings;
      const adapter = yield* makeOpenRouterAdapter({
        httpClient,
        baseUrl: effectiveConfig.apiEndpoint,
        apiKey: apiKey ?? "",
        defaultModel: effectiveConfig.defaultModel,
        instanceId,
      });
      const textGeneration = yield* makeOpenRouterTextGeneration();
      const checkProvider = checkOpenRouterProvider(effectiveConfig, enabled, apiKey, httpClient).pipe(
        Effect.map(identity),
      );
      const snapshot = yield* makeManagedServerProvider<OpenRouterSettings>({
        maintenanceCapabilities: makeManualOnlyProviderMaintenanceCapabilities({
          provider: DRIVER_KIND,
          packageName: null,
        }),
        getSettings: Effect.succeed(effectiveConfig),
        streamSettings: Stream.empty,
        haveSettingsChanged: Equal.equals,
        initialSnapshot: (settings) => makePendingOpenRouterProvider(settings, enabled).pipe(Effect.map(identity)),
        checkProvider,
        refreshInterval: 0,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: `Failed to build OpenRouter snapshot: ${cause.message ?? String(cause)}`,
              cause,
            }),
        ),
      );

      return {
        instanceId,
        driverKind: DRIVER_KIND,
        continuationIdentity,
        displayName,
        accentColor,
        enabled,
        snapshot,
        adapter,
        textGeneration,
      } satisfies ProviderInstance;
    }),
};
