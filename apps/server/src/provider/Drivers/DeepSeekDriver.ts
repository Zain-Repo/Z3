import { DeepSeekSettings, ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient } from "effect/unstable/http";

import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { makeDeepSeekTextGeneration } from "../../textGeneration/DeepSeekTextGeneration.ts";
import { ProviderDriverError } from "../Errors.ts";
import { makeDeepSeekAdapter } from "../Layers/DeepSeekAdapter.ts";
import {
  checkDeepSeekProvider,
  makePendingDeepSeekProvider,
  stampDeepSeekIdentity,
} from "../Layers/DeepSeekProvider.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import { makeManualOnlyProviderMaintenanceCapabilities } from "../providerMaintenance.ts";

const DRIVER_KIND = ProviderDriverKind.make("deepseek");
const decodeDeepSeekSettings = Schema.decodeSync(DeepSeekSettings);

export type DeepSeekDriverEnv =
  | BackgroundPolicy.BackgroundPolicy
  | HttpClient.HttpClient
  | ServerSettingsService;

export const DeepSeekDriver: ProviderDriver<DeepSeekSettings, DeepSeekDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: { displayName: "DeepSeek", supportsMultipleInstances: true },
  configSchema: DeepSeekSettings,
  defaultConfig: () => decodeDeepSeekSettings({}),
  create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
    Effect.gen(function* () {
      const processEnv = mergeProviderInstanceEnvironment(environment);
      const httpClient = yield* HttpClient.HttpClient;
      const apiKey = processEnv.DEEPSEEK_API_KEY?.trim() || undefined;
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });
      const identity = stampDeepSeekIdentity({
        instanceId,
        displayName,
        accentColor,
        continuationGroupKey: continuationIdentity.continuationKey,
      });
      // API keys are owned by the protected provider environment. Keep the
      // decoded config value blank so provider snapshots never expose secrets.
      const effectiveConfig = { ...config, apiKey: "", enabled } satisfies DeepSeekSettings;
      const adapter = yield* makeDeepSeekAdapter({
        httpClient,
        baseUrl: effectiveConfig.apiEndpoint,
        apiKey: apiKey ?? "",
        defaultModel: effectiveConfig.defaultModel,
        instanceId,
      });
      const textGeneration = yield* makeDeepSeekTextGeneration();
      const checkProvider = checkDeepSeekProvider(effectiveConfig, enabled, apiKey, httpClient).pipe(
        Effect.map(identity),
      );
      const snapshot = yield* makeManagedServerProvider<DeepSeekSettings>({
        maintenanceCapabilities: makeManualOnlyProviderMaintenanceCapabilities({
          provider: DRIVER_KIND,
          packageName: null,
        }),
        getSettings: Effect.succeed(effectiveConfig),
        streamSettings: Stream.empty,
        haveSettingsChanged: Equal.equals,
        initialSnapshot: (settings) =>
          makePendingDeepSeekProvider(settings, enabled).pipe(Effect.map(identity)),
        checkProvider,
        refreshInterval: 0,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: `Failed to build DeepSeek snapshot: ${cause.message ?? String(cause)}`,
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
