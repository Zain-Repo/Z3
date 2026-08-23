import { type ThreadId } from "@t3tools/contracts";
import * as Encoding from "effect/Encoding";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { ServerConfig } from "../config.ts";

const directoryNameForThread = (threadId: ThreadId): string =>
  Encoding.encodeBase64Url(new TextEncoder().encode(threadId));

export const resolveChatWorkspacePath = Effect.fn("resolveChatWorkspacePath")(function* (
  threadId: ThreadId,
) {
  const config = yield* ServerConfig;
  const path = yield* Path.Path;
  return path.join(config.chatWorkspacesDir, directoryNameForThread(threadId));
});

export const ensureChatWorkspace = Effect.fn("ensureChatWorkspace")(function* (threadId: ThreadId) {
  const fileSystem = yield* FileSystem.FileSystem;
  const workspacePath = yield* resolveChatWorkspacePath(threadId);
  yield* fileSystem.makeDirectory(workspacePath, { recursive: true });
  return workspacePath;
});

export const removeChatWorkspace = Effect.fn("removeChatWorkspace")(function* (threadId: ThreadId) {
  const fileSystem = yield* FileSystem.FileSystem;
  const workspacePath = yield* resolveChatWorkspacePath(threadId);
  yield* fileSystem.remove(workspacePath, { recursive: true, force: true });
});
