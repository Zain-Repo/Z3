import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel } from "./projector.ts";

it.layer(NodeServices.layer)("chat thread decider", (it) => {
  it.effect("creates isolated approval-required chats without a project", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.create",
          commandId: CommandId.make("create-chat-thread"),
          threadId: ThreadId.make("chat-thread"),
          scope: "chat",
          projectId: null,
          title: "Untitled chat",
          modelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5-codex",
          },
          runtimeMode: "full-access",
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          branch: null,
          worktreePath: null,
          createdAt: "2026-08-22T00:00:00.000Z",
        },
        readModel: createEmptyReadModel("2026-08-22T00:00:00.000Z"),
      });

      if (!("type" in result) || result.type !== "thread.created") {
        throw new Error("Expected a thread.created event");
      }
      expect(result.payload).toMatchObject({
        scope: "chat",
        projectId: null,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
      });
    }),
  );

  it.effect("rejects chat threads that carry project workspace metadata", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "thread.create",
            commandId: CommandId.make("invalid-chat-thread"),
            threadId: ThreadId.make("invalid-chat-thread"),
            scope: "chat",
            projectId: null,
            title: "Invalid chat",
            modelSelection: {
              instanceId: ProviderInstanceId.make("codex"),
              model: "gpt-5-codex",
            },
            runtimeMode: "approval-required",
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            branch: "feature/should-not-exist",
            worktreePath: null,
            createdAt: "2026-08-22T00:00:00.000Z",
          },
          readModel: createEmptyReadModel("2026-08-22T00:00:00.000Z"),
        }),
      );
      expect(error.message).toContain("cannot reference a project, branch, or worktree");
    }),
  );
});
