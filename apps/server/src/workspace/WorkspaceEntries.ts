// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";

import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as RcMap from "effect/RcMap";
import * as Schema from "effect/Schema";

import type {
  FilesystemBrowseInput,
  FilesystemBrowseResult,
  ProjectListEntriesInput,
  ProjectListEntriesResult,
  ProjectSearchContentsInput,
  ProjectSearchContentsResult,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
} from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { isExplicitRelativePath, isWindowsAbsolutePath } from "@t3tools/shared/path";
import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@t3tools/shared/searchRanking";

import * as WorkspacePaths from "./WorkspacePaths.ts";
import * as WorkspaceSearchIndex from "./WorkspaceSearchIndex.ts";

const ALL_WORKSPACE_ENTRIES_LIMIT = 25_000;
const ALL_WORKSPACE_ENTRIES_CACHE_TTL_MS = 5_000;
const ALL_WORKSPACE_ENTRIES_CACHE_MAX_WORKSPACES = 8;

interface AllWorkspaceEntriesResult {
  readonly entries: ProjectListEntriesResult["entries"];
  readonly truncated: boolean;
}

interface AllWorkspaceEntriesCacheEntry {
  readonly expiresAt: number;
  readonly promise: Promise<AllWorkspaceEntriesResult>;
}

async function scanAllWorkspaceEntries(
  cwd: string,
  path: Path.Path,
): Promise<AllWorkspaceEntriesResult> {
  const entries: ProjectListEntriesResult["entries"][number][] = [];
  const pendingDirectories = [{ absolutePath: cwd, relativePath: "" }];
  let nextDirectoryIndex = 0;

  while (nextDirectoryIndex < pendingDirectories.length) {
    const current = pendingDirectories[nextDirectoryIndex];
    nextDirectoryIndex += 1;
    if (!current) break;

    let dirents;
    try {
      dirents = await NodeFSP.readdir(current.absolutePath, { withFileTypes: true });
    } catch (cause) {
      if (current.relativePath.length === 0) throw cause;
      continue;
    }

    for (const dirent of dirents.toSorted((left, right) => left.name.localeCompare(right.name))) {
      // Repository internals are implementation state rather than workspace content and can
      // contain hundreds of thousands of objects even in otherwise small projects.
      if (dirent.name === ".git") continue;

      const relativePath = current.relativePath
        ? `${current.relativePath}/${dirent.name}`
        : dirent.name;
      if (dirent.isDirectory()) {
        entries.push({ path: relativePath, kind: "directory" });
        pendingDirectories.push({
          absolutePath: path.join(current.absolutePath, dirent.name),
          relativePath,
        });
      } else if (dirent.isFile() || dirent.isSymbolicLink()) {
        entries.push({ path: relativePath, kind: "file" });
      }

      if (entries.length >= ALL_WORKSPACE_ENTRIES_LIMIT) {
        return {
          entries: entries.toSorted((left, right) => left.path.localeCompare(right.path)),
          truncated: true,
        };
      }
    }
  }

  return {
    entries: entries.toSorted((left, right) => left.path.localeCompare(right.path)),
    truncated: false,
  };
}

function searchAllWorkspaceEntries(
  scanned: AllWorkspaceEntriesResult,
  query: string,
  limit: number,
  kind?: "file" | "directory",
): ProjectSearchEntriesResult {
  const candidates = kind
    ? scanned.entries.filter((entry) => entry.kind === kind)
    : scanned.entries;
  if (query.length === 0) {
    return {
      entries: candidates.slice(0, limit),
      truncated: scanned.truncated || candidates.length > limit,
    };
  }

  const ranked: Array<{
    item: ProjectSearchEntriesResult["entries"][number];
    score: number;
    tieBreaker: string;
  }> = [];
  let matchCount = 0;
  for (const entry of candidates) {
    const normalizedPath = entry.path.toLowerCase();
    const basename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
    const basenameScore = scoreQueryMatch({
      value: basename,
      query,
      exactBase: 0,
      prefixBase: 100,
      includesBase: 200,
      fuzzyBase: 400,
    });
    const pathScore = scoreQueryMatch({
      value: normalizedPath,
      query,
      exactBase: 50,
      boundaryBase: 150,
      includesBase: 250,
      fuzzyBase: 450,
      boundaryMarkers: ["/", ".", "-", "_"],
    });
    const score =
      basenameScore === null
        ? pathScore
        : pathScore === null
          ? basenameScore
          : Math.min(basenameScore, pathScore);
    if (score === null) continue;

    matchCount += 1;
    insertRankedSearchResult(
      ranked,
      { item: entry, score, tieBreaker: normalizedPath },
      limit,
    );
  }

  return {
    entries: ranked.map((result) => result.item),
    truncated: scanned.truncated || matchCount > limit,
  };
}

export class WorkspaceEntriesWindowsPathUnsupportedError extends Schema.TaggedErrorClass<WorkspaceEntriesWindowsPathUnsupportedError>()(
  "WorkspaceEntriesWindowsPathUnsupportedError",
  {
    cwd: Schema.optional(Schema.String),
    partialPath: Schema.String,
    platform: Schema.String,
  },
) {
  override get message(): string {
    const cwd = this.cwd ? ` from '${this.cwd}'` : "";
    return `Windows-style workspace path '${this.partialPath}' is not supported on '${this.platform}'${cwd}.`;
  }
}

export class WorkspaceEntriesCurrentProjectRequiredError extends Schema.TaggedErrorClass<WorkspaceEntriesCurrentProjectRequiredError>()(
  "WorkspaceEntriesCurrentProjectRequiredError",
  {
    partialPath: Schema.String,
  },
) {
  override get message(): string {
    return `A current project is required to browse relative workspace path '${this.partialPath}'.`;
  }
}

export class WorkspaceEntriesReadDirectoryError extends Schema.TaggedErrorClass<WorkspaceEntriesReadDirectoryError>()(
  "WorkspaceEntriesReadDirectoryError",
  {
    cwd: Schema.optional(Schema.String),
    partialPath: Schema.String,
    parentPath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    const cwd = this.cwd ? ` from '${this.cwd}'` : "";
    return `Failed to read workspace directory '${this.parentPath}' while browsing '${this.partialPath}'${cwd}.`;
  }
}

export const WorkspaceEntriesBrowseError = Schema.Union([
  WorkspaceEntriesWindowsPathUnsupportedError,
  WorkspaceEntriesCurrentProjectRequiredError,
  WorkspaceEntriesReadDirectoryError,
]);
export type WorkspaceEntriesBrowseError = typeof WorkspaceEntriesBrowseError.Type;

export const WorkspaceEntriesError = Schema.Union([
  WorkspacePaths.WorkspaceRootNotExistsError,
  WorkspacePaths.WorkspaceRootCreateFailedError,
  WorkspacePaths.WorkspaceRootStatFailedError,
  WorkspacePaths.WorkspaceRootNotDirectoryError,
  WorkspaceSearchIndex.WorkspaceSearchIndexCreateFailed,
  WorkspaceSearchIndex.WorkspaceSearchIndexScanTimedOut,
  WorkspaceSearchIndex.WorkspaceSearchIndexSearchFailed,
]);
export type WorkspaceEntriesError = typeof WorkspaceEntriesError.Type;

export class WorkspaceEntries extends Context.Service<
  WorkspaceEntries,
  {
    readonly browse: (
      input: FilesystemBrowseInput,
    ) => Effect.Effect<FilesystemBrowseResult, WorkspaceEntriesBrowseError>;
    readonly list: (
      input: ProjectListEntriesInput,
    ) => Effect.Effect<ProjectListEntriesResult, WorkspaceEntriesError>;
    readonly search: (
      input: ProjectSearchEntriesInput,
    ) => Effect.Effect<ProjectSearchEntriesResult, WorkspaceEntriesError>;
    readonly searchContents: (
      input: ProjectSearchContentsInput,
    ) => Effect.Effect<ProjectSearchContentsResult, WorkspaceEntriesError>;
    readonly refresh: (cwd: string) => Effect.Effect<void>;
  }
>()("t3/workspace/WorkspaceEntries") {}

function expandHomePath(input: string, path: Path.Path): string {
  if (input === "~") {
    return NodeOS.homedir();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(NodeOS.homedir(), input.slice(2));
  }
  return input;
}

const resolveBrowseTarget = Effect.fn("WorkspaceEntries.resolveBrowseTarget")(function* (
  input: FilesystemBrowseInput,
  path: Path.Path,
): Effect.fn.Return<string, WorkspaceEntriesBrowseError> {
  const platform = yield* HostProcessPlatform;
  if (platform !== "win32" && isWindowsAbsolutePath(input.partialPath)) {
    return yield* new WorkspaceEntriesWindowsPathUnsupportedError({
      cwd: input.cwd,
      partialPath: input.partialPath,
      platform,
    });
  }

  if (!isExplicitRelativePath(input.partialPath)) {
    return path.resolve(expandHomePath(input.partialPath, path));
  }

  if (!input.cwd) {
    return yield* new WorkspaceEntriesCurrentProjectRequiredError({
      partialPath: input.partialPath,
    });
  }
  return path.resolve(expandHomePath(input.cwd, path), input.partialPath);
});

export const make = Effect.gen(function* () {
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths.WorkspacePaths;
  const workspaceSearchIndexes = yield* WorkspaceSearchIndex.WorkspaceSearchIndexMap;
  const allEntriesCache = new Map<string, AllWorkspaceEntriesCacheEntry>();

  const normalizeWorkspaceRoot = Effect.fn("WorkspaceEntries.normalizeWorkspaceRoot")(function* (
    cwd: string,
  ): Effect.fn.Return<string, WorkspaceEntriesError> {
    return yield* workspacePaths.normalizeWorkspaceRoot(cwd);
  });

  const scanAllEntries = Effect.fn("WorkspaceEntries.scanAllEntries")(function* (
    cwd: string,
  ): Effect.fn.Return<AllWorkspaceEntriesResult, WorkspaceSearchIndex.WorkspaceSearchIndexSearchFailed> {
    const now = yield* Clock.currentTimeMillis;
    for (const [cachedCwd, cached] of allEntriesCache) {
      if (cached.expiresAt <= now) {
        allEntriesCache.delete(cachedCwd);
      }
    }

    const cached = allEntriesCache.get(cwd);
    let promise: Promise<AllWorkspaceEntriesResult>;
    if (cached) {
      // Reinserting a hit keeps iteration order usable as a compact LRU.
      allEntriesCache.delete(cwd);
      allEntriesCache.set(cwd, cached);
      promise = cached.promise;
    } else {
      while (allEntriesCache.size >= ALL_WORKSPACE_ENTRIES_CACHE_MAX_WORKSPACES) {
        const oldestCwd = allEntriesCache.keys().next().value;
        if (oldestCwd === undefined) break;
        allEntriesCache.delete(oldestCwd);
      }

      promise = scanAllWorkspaceEntries(cwd, path);
      allEntriesCache.set(cwd, {
        expiresAt: now + ALL_WORKSPACE_ENTRIES_CACHE_TTL_MS,
        promise,
      });
      void promise.catch(() => {
        if (allEntriesCache.get(cwd)?.promise === promise) {
          allEntriesCache.delete(cwd);
        }
      });
    }

    return yield* Effect.tryPromise({
      try: () => promise,
      catch: (cause) =>
        new WorkspaceSearchIndex.WorkspaceSearchIndexSearchFailed({
          cwd,
          queryLength: 0,
          pageSize: ALL_WORKSPACE_ENTRIES_LIMIT,
          reason: "Recursive workspace scan failed.",
          cause,
        }),
    });
  });

  const refresh: WorkspaceEntries["Service"]["refresh"] = Effect.fn("WorkspaceEntries.refresh")(
    function* (cwd) {
      const normalizedCwd = yield* normalizeWorkspaceRoot(cwd).pipe(
        Effect.orElseSucceed(() => cwd),
      );
      allEntriesCache.delete(normalizedCwd);
      for (const variant of WorkspaceSearchIndex.WORKSPACE_SEARCH_INDEX_VARIANTS) {
        const indexKey = WorkspaceSearchIndex.workspaceSearchIndexKey(normalizedCwd, variant);
        if (!(yield* RcMap.has(workspaceSearchIndexes.rcMap, indexKey))) {
          continue;
        }
        const recoverRefreshFailure = (
          cause:
            | WorkspaceSearchIndex.WorkspaceSearchIndexCreateFailed
            | WorkspaceSearchIndex.WorkspaceSearchIndexScanTimedOut
            | WorkspaceSearchIndex.WorkspaceSearchIndexRefreshFailed,
        ) =>
          Effect.gen(function* () {
            yield* Effect.logWarning("Failed to refresh workspace search index", {
              cwd,
              variant,
              cause,
            });
            yield* workspaceSearchIndexes.invalidate(indexKey);
          });
        yield* Effect.gen(function* () {
          const searchIndex = yield* WorkspaceSearchIndex.WorkspaceSearchIndex;
          yield* searchIndex.refresh();
        }).pipe(
          Effect.provide(workspaceSearchIndexes.get(indexKey)),
          Effect.catchTags({
            WorkspaceSearchIndexCreateFailed: recoverRefreshFailure,
            WorkspaceSearchIndexScanTimedOut: recoverRefreshFailure,
            WorkspaceSearchIndexRefreshFailed: recoverRefreshFailure,
          }),
        );
      }
    },
  );

  const browse: WorkspaceEntries["Service"]["browse"] = Effect.fn("WorkspaceEntries.browse")(
    function* (input) {
      const resolvedInputPath = yield* resolveBrowseTarget(input, path);
      const endsWithSeparator = /[\\/]$/.test(input.partialPath) || input.partialPath === "~";
      const parentPath = endsWithSeparator ? resolvedInputPath : path.dirname(resolvedInputPath);
      const prefix = endsWithSeparator ? "" : path.basename(resolvedInputPath);

      const dirents = yield* Effect.tryPromise({
        try: () => NodeFSP.readdir(parentPath, { withFileTypes: true }),
        catch: (cause) =>
          new WorkspaceEntriesReadDirectoryError({
            cwd: input.cwd,
            partialPath: input.partialPath,
            parentPath,
            cause,
          }),
      }).pipe(
        Effect.catchIf(
          (error) => {
            const code = (error.cause as NodeJS.ErrnoException | undefined)?.code;
            return code === "EACCES" || code === "EPERM";
          },
          () => Effect.succeed([]),
        ),
      );

      const showHidden = input.showHiddenFiles === true || endsWithSeparator || prefix.startsWith(".");
      const lowerPrefix = prefix.toLowerCase();
      const entries: Array<{ readonly name: string; readonly fullPath: string }> = [];
      for (const dirent of dirents) {
        if (
          dirent.isDirectory() &&
          dirent.name.toLowerCase().startsWith(lowerPrefix) &&
          (showHidden || !dirent.name.startsWith("."))
        ) {
          entries.push({
            name: dirent.name,
            fullPath: path.join(parentPath, dirent.name),
          });
        }
      }

      return {
        parentPath,
        entries: entries.toSorted((left, right) => left.name.localeCompare(right.name)),
      };
    },
  );

  const search: WorkspaceEntries["Service"]["search"] = Effect.fn("WorkspaceEntries.search")(
    function* (input) {
      const normalizedCwd = yield* normalizeWorkspaceRoot(input.cwd);
      const normalizedQuery = normalizeSearchQuery(input.query, {
        trimLeadingPattern: /^[@./]+/,
      });
      if (input.showHiddenFiles === true) {
        const scanned = yield* scanAllEntries(normalizedCwd);
        return searchAllWorkspaceEntries(scanned, normalizedQuery, input.limit, input.kind);
      }
      return yield* Effect.gen(function* () {
        const searchIndex = yield* WorkspaceSearchIndex.WorkspaceSearchIndex;
        return yield* searchIndex.search(normalizedQuery, input.limit, input.kind);
      }).pipe(
        Effect.provide(
          workspaceSearchIndexes.get(
            WorkspaceSearchIndex.workspaceSearchIndexKey(normalizedCwd, "paths"),
          ),
        ),
      );
    },
  );

  const searchContents: WorkspaceEntries["Service"]["searchContents"] = Effect.fn(
    "WorkspaceEntries.searchContents",
  )(function* (input) {
    const normalizedCwd = yield* normalizeWorkspaceRoot(input.cwd);
    return yield* Effect.gen(function* () {
      const searchIndex = yield* WorkspaceSearchIndex.WorkspaceSearchIndex;
      return yield* searchIndex.searchContents(input);
    }).pipe(
      Effect.provide(
        workspaceSearchIndexes.get(
          WorkspaceSearchIndex.workspaceSearchIndexKey(normalizedCwd, "content"),
        ),
      ),
    );
  });

  const list: WorkspaceEntries["Service"]["list"] = Effect.fn("WorkspaceEntries.list")(
    function* (input) {
      const normalizedCwd = yield* normalizeWorkspaceRoot(input.cwd);
      if (input.showHiddenFiles === true) {
        return yield* scanAllEntries(normalizedCwd);
      }
      return yield* Effect.gen(function* () {
        const searchIndex = yield* WorkspaceSearchIndex.WorkspaceSearchIndex;
        return yield* searchIndex.list();
      }).pipe(
        Effect.provide(
          workspaceSearchIndexes.get(
            WorkspaceSearchIndex.workspaceSearchIndexKey(normalizedCwd, "paths"),
          ),
        ),
      );
    },
  );

  return WorkspaceEntries.of({ browse, list, refresh, search, searchContents });
});

export const layer = Layer.effect(WorkspaceEntries, make).pipe(
  Layer.provide(WorkspaceSearchIndex.WorkspaceSearchIndexMap.layer),
);
