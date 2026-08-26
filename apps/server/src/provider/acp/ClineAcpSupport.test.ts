import { describe, expect, it } from "vite-plus/test";

import {
  buildClineAcpSpawnInput,
  currentClineModelIdFromSessionSetup,
  resolveClineAcpBaseModelId,
  resolveClineAuthMethodId,
} from "./ClineAcpSupport.ts";

describe("ClineAcpSupport", () => {
  it("resolves the auth method id with a cline default", () => {
    expect(resolveClineAuthMethodId(undefined)).toBe("cline");
    expect(resolveClineAuthMethodId("cline-pass")).toBe("cline-pass");
    expect(resolveClineAuthMethodId("openai-codex")).toBe("openai-codex");
  });

  it("resolves provider-scoped model ids without slug normalization", () => {
    expect(resolveClineAcpBaseModelId("  anthropic/claude-sonnet-5  ")).toBe(
      "anthropic/claude-sonnet-5",
    );
    expect(resolveClineAcpBaseModelId("")).toBeUndefined();
    expect(resolveClineAcpBaseModelId(undefined)).toBeUndefined();
    expect(resolveClineAcpBaseModelId("   ")).toBeUndefined();
  });

  it("builds the cline --acp spawn input with optional data dir", () => {
    expect(buildClineAcpSpawnInput(null, "/work")).toEqual({
      command: "cline",
      args: ["--acp"],
      cwd: "/work",
    });

    expect(
      buildClineAcpSpawnInput(
        { binaryPath: "cline", authMethod: "cline", dataDir: "  " },
        "/work",
      ),
    ).toEqual({
      command: "cline",
      args: ["--acp"],
      cwd: "/work",
    });

    expect(
      buildClineAcpSpawnInput(
        { binaryPath: "/usr/bin/cline", authMethod: "cline", dataDir: "~/.cline" },
        "/work",
      ),
    ).toEqual({
      command: "/usr/bin/cline",
      args: ["--acp", "--data-dir", "~/.cline"],
      cwd: "/work",
    });
  });

  it("reads the current model id from a session setup result", () => {
    expect(
      currentClineModelIdFromSessionSetup({
        models: { currentModelId: "  openai/gpt-5  ", availableModels: [] },
      } as never),
    ).toBe("openai/gpt-5");
    expect(currentClineModelIdFromSessionSetup({} as never)).toBeUndefined();
  });
});
