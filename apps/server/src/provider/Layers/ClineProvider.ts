import {
  type ClineSettings,
  type ModelCapabilities,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import type * as EffectAcpSchema from "effect-acp/schema";
import { causeErrorTag } from "@t3tools/shared/observability";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  type ProviderMaintenanceCapabilities,
} from "../providerMaintenance.ts";
import { makeClineAcpRuntime } from "../acp/ClineAcpSupport.ts";
import { buildAcpModelOptionDescriptors } from "../acp/AcpRuntimeModel.ts";

const CLINE_PRESENTATION = {
  displayName: "Cline",
  badgeLabel: "Early Access",
  showInteractionModeToggle: true,
  requiresNewThreadForModelChange: false,
} as const;
const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const VERSION_PROBE_TIMEOUT_MS = 4_000;
const CLINE_ACP_MODEL_DISCOVERY_TIMEOUT_MS = 15_000;

export function buildInitialClineProviderSnapshot(
  clineSettings: ClineSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = clineModelsFromSettings(clineSettings.customModels);

    if (!clineSettings.enabled) {
      return buildServerProvider({
        presentation: CLINE_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Cline is disabled in Z3 settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: CLINE_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Checking Cline CLI availability...",
      },
    });
  });
}

function clineModelsFromSettings(
  customModels: ReadonlyArray<string> | undefined,
  builtInModels: ReadonlyArray<ServerProviderModel> = [],
): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(builtInModels, customModels ?? [], EMPTY_CAPABILITIES);
}

function buildClineDiscoveredModelsFromSessionModelState(
  modelState: EffectAcpSchema.SessionModelState | null | undefined,
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption> | null | undefined,
): ReadonlyArray<ServerProviderModel> {
  if (!modelState || modelState.availableModels.length === 0) {
    return [];
  }
  const optionDescriptors = buildAcpModelOptionDescriptors(configOptions);
  const seen = new Set<string>();
  return modelState.availableModels
    .map((model): ServerProviderModel | undefined => {
      const slug = model.modelId.trim();
      if (!slug || seen.has(slug)) {
        return undefined;
      }
      seen.add(slug);
      return {
        slug,
        name: model.name.trim() || slug,
        isCustom: false,
        capabilities: createModelCapabilities({ optionDescriptors }),
      };
    })
    .filter((model): model is ServerProviderModel => model !== undefined);
}

const discoverClineModelsViaAcp = (
  clineSettings: ClineSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const acp = yield* makeClineAcpRuntime({
      clineSettings,
      environment,
      childProcessSpawner,
      cwd: process.cwd(),
      clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    });
    const started = yield* acp.start();
    return buildClineDiscoveredModelsFromSessionModelState(
      started.sessionSetupResult.models,
      started.sessionSetupResult.configOptions,
    );
  }).pipe(Effect.scoped);

const runClineVersionCommand = (
  clineSettings: ClineSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const command = clineSettings.binaryPath || "cline";
    const spawnCommand = yield* resolveSpawnCommand(command, ["--version"], {
      env: environment,
    });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
      }),
    );
  });

export const checkClineProviderStatus = Effect.fn("checkClineProviderStatus")(function* (
  clineSettings: ClineSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<
  ServerProviderDraft,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto
> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const fallbackModels = clineModelsFromSettings(clineSettings.customModels);

  if (!clineSettings.enabled) {
    return buildServerProvider({
      presentation: CLINE_PRESENTATION,
      enabled: false,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Cline is disabled in Z3 settings.",
      },
    });
  }

  const versionResult = yield* runClineVersionCommand(clineSettings, environment).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );

  if (Result.isFailure(versionResult)) {
    const error = versionResult.failure;
    yield* Effect.logWarning("Cline CLI health check failed.", {
      errorTag: error._tag,
    });
    return buildServerProvider({
      presentation: CLINE_PRESENTATION,
      enabled: clineSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? "Cline CLI (cline) is not installed or not on PATH. Install it with: npm install -g cline"
          : "Failed to execute Cline CLI health check.",
      },
    });
  }

  if (Option.isNone(versionResult.success)) {
    return buildServerProvider({
      presentation: CLINE_PRESENTATION,
      enabled: clineSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "Cline CLI is installed but timed out while running cline --version.",
      },
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(versionOutput.stdout + "\n" + versionOutput.stderr);
  if (versionOutput.code !== 0) {
    yield* Effect.logWarning("Cline CLI version probe exited with a non-zero status.", {
      exitCode: versionOutput.code,
      stdoutLength: versionOutput.stdout.length,
      stderrLength: versionOutput.stderr.length,
    });
    return buildServerProvider({
      presentation: CLINE_PRESENTATION,
      enabled: clineSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "Cline CLI is installed but failed to run.",
      },
    });
  }

  const discoveryExit = yield* discoverClineModelsViaAcp(clineSettings, environment).pipe(
    Effect.timeoutOption(CLINE_ACP_MODEL_DISCOVERY_TIMEOUT_MS),
    Effect.exit,
  );
  if (Exit.isFailure(discoveryExit)) {
    yield* Effect.logWarning("Cline ACP model discovery failed", {
      errorTag: causeErrorTag(discoveryExit.cause),
    });
    return buildServerProvider({
      presentation: CLINE_PRESENTATION,
      enabled: clineSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "Cline CLI is installed but ACP startup failed. Check server logs for details.",
      },
    });
  }
  if (Option.isNone(discoveryExit.value)) {
    yield* Effect.logWarning(
      "Cline ACP model discovery timed out after " +
        CLINE_ACP_MODEL_DISCOVERY_TIMEOUT_MS +
        "ms.",
    );
    return buildServerProvider({
      presentation: CLINE_PRESENTATION,
      enabled: clineSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message:
          "Cline CLI is installed but ACP startup timed out after " +
          CLINE_ACP_MODEL_DISCOVERY_TIMEOUT_MS +
          "ms.",
      },
    });
  }
  const discoveredModels = discoveryExit.value.value;
  const models =
    discoveredModels.length > 0
      ? clineModelsFromSettings(clineSettings.customModels, discoveredModels)
      : fallbackModels;

  return buildServerProvider({
    presentation: CLINE_PRESENTATION,
    enabled: clineSettings.enabled,
    checkedAt,
    models,
    probe: {
      installed: true,
      version,
      status: "ready",
      auth: { status: "unknown" },
    },
  });
});

export const enrichClineSnapshot = (input: {
  readonly snapshot: ServerProvider;
  readonly maintenanceCapabilities: ProviderMaintenanceCapabilities;
  readonly enableProviderUpdateChecks?: boolean;
  readonly publishSnapshot: (snapshot: ServerProvider) => Effect.Effect<void>;
  readonly httpClient: HttpClient.HttpClient;
}): Effect.Effect<void> => {
  const { snapshot, publishSnapshot } = input;

  return enrichProviderSnapshotWithVersionAdvisory(snapshot, input.maintenanceCapabilities, {
    enableProviderUpdateChecks: input.enableProviderUpdateChecks,
  }).pipe(
    Effect.provideService(HttpClient.HttpClient, input.httpClient),
    Effect.flatMap((enrichedSnapshot) => publishSnapshot(enrichedSnapshot)),
    Effect.catchCause((cause) =>
      Effect.logWarning("Cline version advisory enrichment failed", {
        errorTag: causeErrorTag(cause),
      }),
    ),
    Effect.asVoid,
  );
};
