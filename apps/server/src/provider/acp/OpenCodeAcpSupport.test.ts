import { describe, expect, it } from "vite-plus/test";

import type * as EffectAcpSchema from "effect-acp/schema";

import {
  buildOpenCodeAcpSpawnInput,
  currentOpenCodeModelIdFromSessionSetup,
} from "./OpenCodeAcpSupport.ts";

describe("OpenCodeAcpSupport", () => {
  it("starts the native ACP command with the configured binary and cwd", () => {
    expect(
      buildOpenCodeAcpSpawnInput(
        { binaryPath: "C:/tools/opencode.exe" },
        "C:/workspace/project",
        { OPENCODE_CONFIG_DIR: "C:/config" },
      ),
    ).toEqual({
      command: "C:/tools/opencode.exe",
      args: ["acp"],
      cwd: "C:/workspace/project",
      env: { OPENCODE_CONFIG_DIR: "C:/config" },
    });
  });

  it("reads the active model from ACP session setup", () => {
    expect(
      currentOpenCodeModelIdFromSessionSetup({
        sessionId: "session-1",
        models: {
          currentModelId: " anthropic/claude-sonnet-4 ",
          availableModels: [],
        },
        configOptions: [],
      } satisfies EffectAcpSchema.NewSessionResponse),
    ).toBe("anthropic/claude-sonnet-4");
  });
});
