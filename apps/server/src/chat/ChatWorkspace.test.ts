import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import * as ServerConfig from "../config.ts";
import {
  ensureChatWorkspace,
  removeChatWorkspace,
  resolveChatWorkspacePath,
} from "./ChatWorkspace.ts";
import { ThreadId } from "@t3tools/contracts";

it.layer(NodeServices.layer)("ChatWorkspace", (it) => {
  it.effect(
    "keeps each chat workspace under server-owned state and removes only that workspace",
    () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const config = yield* ServerConfig.ServerConfig;
        const threadId = ThreadId.make("chat/workspace-test");
        const workspacePath = yield* ensureChatWorkspace(threadId);

        assert.isTrue(workspacePath.startsWith(config.chatWorkspacesDir));
        assert.isTrue(yield* fileSystem.exists(workspacePath));
        assert.equal(yield* resolveChatWorkspacePath(threadId), workspacePath);

        yield* removeChatWorkspace(threadId);
        assert.isFalse(yield* fileSystem.exists(workspacePath));
        assert.isTrue(yield* fileSystem.exists(config.chatWorkspacesDir));
      }).pipe(
        Effect.provide(
          ServerConfig.layerTest(process.cwd(), { prefix: "t3-chat-workspace-test-" }),
        ),
      ),
  );
});
