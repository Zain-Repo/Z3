/**
 * Optional integration check against a real `cline --acp` install.
 * Enable with: T3_CLINE_ACP_PROBE=1 bun run test ClineAcpCliProbe
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { describe, expect } from "vite-plus/test";

import { makeClineAcpRuntime } from "./ClineAcpSupport.ts";

const makeProbeRuntime = Effect.gen(function* () {
  const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* makeClineAcpRuntime({
    clineSettings: { binaryPath: "cline", authMethod: "cline", dataDir: "" },
    environment: process.env,
    childProcessSpawner,
    cwd: process.cwd(),
    clientInfo: { name: "t3-cline-probe", version: "0.0.0" },
  });
});

describe.runIf(process.env.T3_CLINE_ACP_PROBE === "1")("Cline ACP CLI probe", () => {
  it.effect("initialize and authenticate against real cline --acp", () =>
    Effect.gen(function* () {
      const runtime = yield* makeProbeRuntime;
      const started = yield* runtime.start();
      expect(started.initializeResult).toBeDefined();
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("session/new advertises modes and a typed SessionModelState", () =>
    Effect.gen(function* () {
      const runtime = yield* makeProbeRuntime;
      const started = yield* runtime.start();
      const result = started.sessionSetupResult;

      expect(typeof started.sessionId).toBe("string");
      expect(result.modes?.availableModes.length ?? 0).toBeGreaterThan(0);
      expect(typeof result.models?.currentModelId).toBe("string");
      expect(result.models?.availableModels.length ?? 0).toBeGreaterThan(0);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("session/set_config_option switches the model in-session", () =>
    Effect.gen(function* () {
      const runtime = yield* makeProbeRuntime;
      const started = yield* runtime.start();
      const currentModelId = started.sessionSetupResult.models?.currentModelId?.trim();
      expect(currentModelId).toBeDefined();
      if (!currentModelId) return;
      yield* runtime.setModel(currentModelId);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
