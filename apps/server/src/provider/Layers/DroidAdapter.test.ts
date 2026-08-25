// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import {
  DroidSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";

import { ServerConfig } from "../../config.ts";
import {
  droidSupportedApprovalDecisions,
  makeDroidAdapter,
  selectDroidPermissionOutcome,
} from "./DroidAdapter.ts";

const decodeDroidSettings = Schema.decodeSync(DroidSettings);
const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const mockAgentPath = NodePath.join(__dirname, "../../../scripts/droid-mock-agent.ts");

const droidAdapterTestLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3code-droid-adapter-test-",
}).pipe(Layer.provideMerge(NodeServices.layer));

it("selects only recognized Droid permission outcomes", () => {
  const options = [
    { label: "Start high-autonomy session", outcome: "proceed_new_session_high" },
    { label: "Auto-run", outcome: "proceed_auto_run_high" },
    { label: "Approve once", outcome: " proceed_once " },
    { label: "Future grant", outcome: "future_unrestricted_grant" },
    { label: "Decline", outcome: "cancel" },
  ];

  assert.equal(selectDroidPermissionOutcome(options, "accept"), " proceed_once ");
  assert.isUndefined(selectDroidPermissionOutcome(options, "acceptForSession"));
  assert.equal(selectDroidPermissionOutcome(options, "decline"), "cancel");
  assert.deepStrictEqual(droidSupportedApprovalDecisions(options), ["accept", "decline"]);

  for (const outcome of [
    " proceed_always ",
    "proceed_always_file",
    "proceed_always_tools",
    "proceed_always_server",
  ]) {
    assert.equal(
      selectDroidPermissionOutcome([{ label: "Persistent", outcome }], "acceptForSession"),
      outcome,
    );
  }
});

it.layer(droidAdapterTestLayer)("DroidAdapterLive", (it) => {
  it.effect("streams a turn and rolls it back through the numeric adapter contract", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("droid-adapter-smoke");
      const adapter = yield* makeDroidAdapter(decodeDroidSettings({ binaryPath: "droid" }), {
        rpcSpawnOverride: {
          command: process.execPath,
          args: [mockAgentPath],
        },
      }).pipe(Effect.orDie);
      const events: ProviderRuntimeEvent[] = [];
      const turnCompleted = yield* Deferred.make<void>();
      const eventsFiber = yield* Stream.runForEach(adapter.streamEvents, (event) =>
        Effect.sync(() => events.push(event)).pipe(
          Effect.andThen(
            event.type === "turn.completed" && String(event.threadId) === String(threadId)
              ? Deferred.succeed(turnCompleted, undefined).pipe(Effect.asVoid)
              : Effect.void,
          ),
        ),
      ).pipe(Effect.forkChild);

      const session = yield* adapter.startSession({
        threadId,
        provider: ProviderDriverKind.make("droid"),
        cwd: process.cwd(),
        runtimeMode: "full-access",
        modelSelection: {
          instanceId: ProviderInstanceId.make("droid"),
          model: "mock-deep",
          options: [{ id: "reasoningEffort", value: "high" }],
        },
      });
      const sent = yield* adapter.sendTurn({
        threadId,
        input: "hello droid",
        attachments: [],
      });
      yield* Deferred.await(turnCompleted);

      assert.equal(session.provider, "droid");
      assert.equal(session.model, "mock-deep");
      assert.isTrue(
        events.some(
          (event) =>
            event.type === "content.delta" &&
            event.payload.streamKind === "assistant_text" &&
            event.payload.delta.includes("droid"),
        ),
      );
      assert.isTrue(
        events.some(
          (event) =>
            event.type === "turn.completed" &&
            event.turnId === sent.turnId &&
            event.payload.state === "completed",
        ),
      );

      const rolledBack = yield* adapter.rollbackThread(threadId, 1);
      assert.deepStrictEqual(rolledBack.turns, []);
      assert.deepStrictEqual(rolledBack.resumeCursor, {
        schemaVersion: 2,
        sessionId: "mock-session-rewound",
        turnIds: [],
      });

      yield* adapter.stopSession(threadId);
      assert.isFalse(yield* adapter.hasSession(threadId));
      yield* Fiber.interrupt(eventsFiber);
    }).pipe(Effect.timeout("20 seconds")),
  );

  it.effect("fails and removes the session when Droid cannot confirm interruption", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("droid-interrupt-failure");
      const adapter = yield* makeDroidAdapter(decodeDroidSettings({ binaryPath: "droid" }), {
        environment: {
          T3_DROID_MOCK_HANG_TURN: "1",
          T3_DROID_MOCK_FAIL_INTERRUPT: "1",
        },
        rpcSpawnOverride: {
          command: process.execPath,
          args: [mockAgentPath],
        },
      }).pipe(Effect.orDie);

      yield* adapter.startSession({
        threadId,
        provider: ProviderDriverKind.make("droid"),
        cwd: process.cwd(),
        runtimeMode: "full-access",
      });
      const turn = yield* adapter.sendTurn({
        threadId,
        input: "hang until interrupted",
        attachments: [],
      });
      const interrupted = yield* adapter.interruptTurn(threadId, turn.turnId).pipe(Effect.result);

      assert.equal(interrupted._tag, "Failure");
      assert.isFalse(yield* adapter.hasSession(threadId));
      assert.deepStrictEqual(yield* adapter.listSessions(), []);
    }).pipe(Effect.timeout("20 seconds")),
  );

  it.effect("resumes a persisted Droid session", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("droid-resume-smoke");
      const adapter = yield* makeDroidAdapter(decodeDroidSettings({ binaryPath: "droid" }), {
        rpcSpawnOverride: {
          command: process.execPath,
          args: [mockAgentPath],
        },
      }).pipe(Effect.orDie);

      const session = yield* adapter.startSession({
        threadId,
        provider: ProviderDriverKind.make("droid"),
        cwd: process.cwd(),
        runtimeMode: "approval-required",
        resumeCursor: {
          schemaVersion: 2,
          sessionId: "mock-session-known",
          turnIds: [],
        },
      });

      assert.equal(session.status, "ready");
      assert.equal(session.provider, "droid");
      yield* adapter.stopSession(threadId);
    }).pipe(Effect.timeout("20 seconds")),
  );
});
