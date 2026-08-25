// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

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
import {
  makeOpenRouterAdapter,
  OPENROUTER_WORKSPACE_TOOL_DEFINITIONS,
  type OpenRouterToolSupport,
} from "../Layers/OpenRouterAdapter.ts";
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

function toolError(cause: unknown): string {
  return JSON.stringify({
    error: cause instanceof Error ? cause.message : "Workspace tool execution failed.",
  });
}

function argumentRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringArgument(argumentsValue: Record<string, unknown>, name: string): string | undefined {
  const value = argumentsValue[name];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

const MAX_TOOL_FILE_BYTES = 1024 * 1024;
const MAX_LIST_ENTRIES = 200;
const SKIPPED_DIRECTORY_NAMES = new Set([".git", ".t3", "node_modules", "dist", "build"]);

class OpenRouterWorkspaceToolError extends Schema.TaggedErrorClass<OpenRouterWorkspaceToolError>()(
  "OpenRouterWorkspaceToolError",
  { detail: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return this.detail;
  }
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = NodePath.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${NodePath.sep}`) &&
      !NodePath.isAbsolute(relative))
  );
}

/** Resolve an existing file and verify both lexical and symlink-safe containment. */
async function resolveExistingWorkspacePath(
  cwd: string,
  relativePath: string,
): Promise<{
  readonly root: string;
  readonly target: string;
}> {
  if (NodePath.isAbsolute(relativePath)) throw new Error("Workspace tool paths must be relative.");
  const root = await NodeFSP.realpath(cwd);
  const target = NodePath.resolve(root, relativePath);
  if (!isWithinRoot(root, target)) throw new Error("The requested path is outside the workspace.");
  const realTarget = await NodeFSP.realpath(target);
  if (!isWithinRoot(root, realTarget))
    throw new Error("The requested path is outside the workspace.");
  return { root, target: realTarget };
}

/** Resolve a write target while validating the nearest existing parent directory. */
async function resolveWritableWorkspacePath(
  cwd: string,
  relativePath: string,
): Promise<{
  readonly root: string;
  readonly target: string;
}> {
  if (NodePath.isAbsolute(relativePath)) throw new Error("Workspace tool paths must be relative.");
  const root = await NodeFSP.realpath(cwd);
  const target = NodePath.resolve(root, relativePath);
  if (!isWithinRoot(root, target)) throw new Error("The requested path is outside the workspace.");
  let parentCandidate = NodePath.dirname(target);
  while (true) {
    try {
      const parent = await NodeFSP.realpath(parentCandidate);
      if (!isWithinRoot(root, parent))
        throw new Error("The requested path is outside the workspace.");
      break;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
      const nextParent = NodePath.dirname(parentCandidate);
      if (nextParent === parentCandidate) throw cause;
      parentCandidate = nextParent;
    }
  }
  try {
    const realTarget = await NodeFSP.realpath(target);
    if (!isWithinRoot(root, realTarget))
      throw new Error("The requested path is outside the workspace.");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
  }
  return { root, target };
}

async function readWorkspaceFile(cwd: string, relativePath: string): Promise<string> {
  const resolved = await resolveExistingWorkspacePath(cwd, relativePath);
  const stat = await NodeFSP.stat(resolved.target);
  if (!stat.isFile()) throw new Error("The requested workspace path is not a file.");
  const bytes = await NodeFSP.readFile(resolved.target);
  if (bytes.includes(0)) throw new Error("The requested workspace file is binary.");
  const truncated = bytes.length > MAX_TOOL_FILE_BYTES;
  return JSON.stringify({
    relativePath: NodePath.relative(resolved.root, resolved.target),
    contents: new TextDecoder().decode(truncated ? bytes.subarray(0, MAX_TOOL_FILE_BYTES) : bytes),
    byteLength: bytes.length,
    truncated,
  });
}

async function writeWorkspaceFile(
  cwd: string,
  relativePath: string,
  contents: string,
): Promise<string> {
  const resolved = await resolveWritableWorkspacePath(cwd, relativePath);
  await NodeFSP.mkdir(NodePath.dirname(resolved.target), { recursive: true });
  await NodeFSP.writeFile(resolved.target, contents, "utf8");
  return JSON.stringify({ relativePath: NodePath.relative(resolved.root, resolved.target) });
}

async function listWorkspaceEntries(
  cwd: string,
  query: string,
  kind: "file" | "directory" | undefined,
): Promise<string> {
  const root = await NodeFSP.realpath(cwd);
  const normalizedQuery = query.toLowerCase();
  const entries: Array<{ readonly path: string; readonly kind: "file" | "directory" }> = [];
  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    if (entries.length >= MAX_LIST_ENTRIES) return;
    for (const entry of await NodeFSP.readdir(directory, { withFileTypes: true })) {
      if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue;
      const relativePath = NodePath.join(relativeDirectory, entry.name);
      const entryKind = entry.isDirectory() ? "directory" : entry.isFile() ? "file" : undefined;
      if (
        entryKind &&
        (!kind || kind === entryKind) &&
        relativePath.toLowerCase().includes(normalizedQuery)
      ) {
        entries.push({ path: relativePath, kind: entryKind });
      }
      if (entry.isDirectory()) await visit(NodePath.join(directory, entry.name), relativePath);
      if (entries.length >= MAX_LIST_ENTRIES) return;
    }
  };
  await visit(root, "");
  return JSON.stringify({ entries, truncated: entries.length >= MAX_LIST_ENTRIES });
}

/**
 * Expose only bounded workspace operations to direct OpenRouter sessions.
 * Shell execution remains outside this API-backed driver until it has an
 * approval flow equivalent to the native provider adapters.
 */
function makeWorkspaceToolSupport(): OpenRouterToolSupport {
  const runWorkspaceTool = (run: () => Promise<string>) =>
    Effect.tryPromise({
      try: run,
      catch: (cause) =>
        new OpenRouterWorkspaceToolError({
          detail: cause instanceof Error ? cause.message : "Workspace tool execution failed.",
          cause,
        }),
    }).pipe(Effect.catch((cause) => Effect.succeed(toolError(cause))));

  return {
    definitions: OPENROUTER_WORKSPACE_TOOL_DEFINITIONS,
    execute: (input) => {
      if (!input.cwd)
        return Effect.succeed(toolError(new Error("No workspace is bound to this session.")));
      const args = argumentRecord(input.arguments);
      switch (input.name) {
        case "read_file": {
          const relativePath = stringArgument(args, "path");
          if (!relativePath)
            return Effect.succeed(toolError(new Error("The file path is required.")));
          return runWorkspaceTool(() => readWorkspaceFile(input.cwd!, relativePath));
        }
        case "write_file": {
          const relativePath = stringArgument(args, "path");
          const contents = args.contents;
          if (!relativePath || typeof contents !== "string") {
            return Effect.succeed(toolError(new Error("Both path and contents are required.")));
          }
          if (input.runtimeMode === "approval-required") {
            return Effect.succeed(
              toolError(new Error("File writes require approval in this session.")),
            );
          }
          return runWorkspaceTool(() => writeWorkspaceFile(input.cwd!, relativePath, contents));
        }
        case "list_files": {
          const query = typeof args.query === "string" ? args.query : "";
          const kind = args.kind === "file" || args.kind === "directory" ? args.kind : undefined;
          return runWorkspaceTool(() => listWorkspaceEntries(input.cwd!, query, kind));
        }
        default:
          return Effect.succeed(toolError(new Error(`Unknown workspace tool '${input.name}'.`)));
      }
    },
  };
}

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
        toolSupport: makeWorkspaceToolSupport(),
      });
      const textGeneration = yield* makeOpenRouterTextGeneration();
      const checkProvider = checkOpenRouterProvider(
        effectiveConfig,
        enabled,
        apiKey,
        httpClient,
      ).pipe(Effect.map(identity));
      const snapshot = yield* makeManagedServerProvider<OpenRouterSettings>({
        maintenanceCapabilities: makeManualOnlyProviderMaintenanceCapabilities({
          provider: DRIVER_KIND,
          packageName: null,
        }),
        getSettings: Effect.succeed(effectiveConfig),
        streamSettings: Stream.empty,
        haveSettingsChanged: Equal.equals,
        initialSnapshot: (settings) =>
          makePendingOpenRouterProvider(settings, enabled).pipe(Effect.map(identity)),
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
