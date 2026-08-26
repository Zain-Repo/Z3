import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { ProcessRunner } from "../processRunner.ts";
import { WorkspaceEntries } from "../workspace/WorkspaceEntries.ts";
import { WorkspaceFileSystem } from "../workspace/WorkspaceFileSystem.ts";
import {
  OPENROUTER_WORKSPACE_TOOL_DEFINITIONS,
  type OpenRouterToolSupport,
} from "./Layers/OpenRouterAdapter.ts";

function toolError(cause: unknown): string {
  return JSON.stringify({ error: cause instanceof Error ? cause.message : String(cause) });
}

function argumentRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringArgument(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Apply one strict, single-file unified diff without permitting path changes. */
export function applyStrictUnifiedPatch(original: string, patch: string): string {
  const patchLines = patch.replaceAll("\r\n", "\n").split("\n");
  const oldFileHeader = patchLines[0];
  const newFileHeader = patchLines[1];
  if (
    patchLines.length < 3 ||
    oldFileHeader === undefined ||
    newFileHeader === undefined ||
    !oldFileHeader.startsWith("--- ") ||
    !newFileHeader.startsWith("+++ ")
  ) {
    throw new Error("apply_patch requires a single-file unified diff.");
  }
  if (patchLines.slice(2).some((line) => line.startsWith("--- ") || line.startsWith("+++ "))) {
    throw new Error("apply_patch accepts exactly one file.");
  }
  const source = original.replaceAll("\r\n", "\n").split("\n");
  const output: string[] = [];
  let sourceIndex = 0;
  let patchIndex = 2;
  while (patchIndex < patchLines.length) {
    const header = patchLines[patchIndex++];
    if (header === undefined) throw new Error("apply_patch contains an incomplete hunk.");
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
    if (!match) throw new Error("apply_patch contains an invalid hunk header.");
    const oldStartText = match[1];
    if (oldStartText === undefined) throw new Error("apply_patch contains an invalid hunk header.");
    const oldStart = Number(oldStartText) - 1;
    const oldCount = Number(match[2] ?? 1);
    const newCount = Number(match[4] ?? 1);
    if (oldStart < sourceIndex || oldStart > source.length) {
      throw new Error("apply_patch hunk is out of range.");
    }
    output.push(...source.slice(sourceIndex, oldStart));
    let consumed = 0;
    let produced = 0;
    while (patchIndex < patchLines.length) {
      const nextLine = patchLines[patchIndex];
      if (nextLine === undefined || nextLine.startsWith("@@ ")) break;
      const line = patchLines[patchIndex++];
      if (line === undefined) throw new Error("apply_patch contains an incomplete hunk.");
      if (line.length === 0 && patchIndex === patchLines.length) break;
      if (line.startsWith("\\ No newline")) {
        throw new Error("apply_patch requires newline-terminated text.");
      }
      if (line.length === 0) throw new Error("apply_patch contains an invalid hunk line.");
      const marker = line[0];
      const value = line.slice(1);
      if (marker === " " || marker === "-") {
        if (source[oldStart + consumed] !== value) {
          throw new Error("apply_patch context does not match the current file.");
        }
        consumed += 1;
      }
      if (marker === " " || marker === "+") {
        output.push(value);
        produced += 1;
      } else if (marker !== "-") {
        throw new Error("apply_patch contains an invalid hunk line.");
      }
    }
    if (consumed !== oldCount || produced !== newCount) {
      throw new Error("apply_patch hunk line counts do not match its header.");
    }
    sourceIndex = oldStart + consumed;
  }
  output.push(...source.slice(sourceIndex));
  return output.join("\n");
}

type WorkspaceToolInput = Parameters<OpenRouterToolSupport["execute"]>[0];

/** Build workspace tools without requiring workspace services during provider startup. */
export const makeWorkspaceToolSupport = (): OpenRouterToolSupport => ({
  definitions: OPENROUTER_WORKSPACE_TOOL_DEFINITIONS,
  approvalKind: (name) =>
    name === "run_command"
      ? "command"
      : name === "write_file" || name === "apply_patch"
        ? "file-change"
        : "none",
  execute: (input: WorkspaceToolInput) =>
    Effect.gen(function* () {
      const entries = yield* WorkspaceEntries;
      const fileSystem = yield* WorkspaceFileSystem;
      const processRunner = yield* ProcessRunner;
      const run = <A, E>(effect: Effect.Effect<A, E>) =>
        effect.pipe(
          Effect.map((value) => JSON.stringify(value)),
          Effect.catch((cause: E) => Effect.succeed(toolError(cause))),
        );
      if (!input.cwd) {
        return toolError(new Error("No workspace is bound to this session."));
      }
      const args = argumentRecord(input.arguments);
      switch (input.name) {
        case "read_file": {
          const path = stringArgument(args, "path");
          return path
            ? yield* run(fileSystem.readFile({ cwd: input.cwd, relativePath: path }))
            : toolError(new Error("The file path is required."));
        }
        case "write_file": {
          const path = stringArgument(args, "path");
          const contents = args.contents;
          return path && typeof contents === "string"
            ? yield* run(fileSystem.writeFile({ cwd: input.cwd, relativePath: path, contents }))
            : toolError(new Error("Both path and contents are required."));
        }
        case "apply_patch": {
          const path = stringArgument(args, "path");
          const patch = typeof args.patch === "string" ? args.patch : undefined;
          if (!path || patch === undefined) {
            return toolError(new Error("Both path and patch are required."));
          }
          return yield* Effect.gen(function* () {
            const current = yield* fileSystem.readFile({ cwd: input.cwd!, relativePath: path });
            const contents = applyStrictUnifiedPatch(current.contents, patch);
            return yield* fileSystem.writeFile({ cwd: input.cwd!, relativePath: path, contents });
          }).pipe(
            Effect.map((value) => JSON.stringify(value)),
            Effect.catch((cause) => Effect.succeed(toolError(cause))),
          );
        }
        case "list_files": {
          const query = typeof args.query === "string" ? args.query : "";
          const kind = args.kind === "file" || args.kind === "directory" ? args.kind : undefined;
          return yield* run(
            entries.search({ cwd: input.cwd, query, limit: 200, ...(kind ? { kind } : {}) }),
          );
        }
        case "search_files": {
          const query = stringArgument(args, "query");
          return query
            ? yield* run(
                entries.searchContents({
                  cwd: input.cwd,
                  query,
                  limit: 100,
                  caseSensitive: false,
                  wholeWord: false,
                  useRegex: false,
                }),
              )
            : toolError(new Error("The search query is required."));
        }
        case "run_command": {
          const command = stringArgument(args, "command");
          const commandArgs =
            Array.isArray(args.args) && args.args.every((value) => typeof value === "string")
              ? args.args
              : [];
          const timeoutSeconds =
            typeof args.timeoutSeconds === "number" && Number.isFinite(args.timeoutSeconds)
              ? Math.min(Math.max(args.timeoutSeconds, 1), 120)
              : 60;
          return command
            ? yield* run(
                processRunner.run({
                  command,
                  args: commandArgs,
                  cwd: input.cwd,
                  timeout: Duration.seconds(timeoutSeconds),
                  maxOutputBytes: 256 * 1024,
                  outputMode: "truncate",
                  timeoutBehavior: "timedOutResult",
                }),
              )
            : toolError(new Error("The command is required."));
        }
        default:
          return toolError(new Error(`Unknown workspace tool '${input.name}'.`));
      }
    }) as unknown as Effect.Effect<string>,
});
