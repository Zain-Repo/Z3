import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveChatSidebarProviderPresentation } from "./chatSidebarProviderPresentation";

function provider(input: {
  readonly driver: ProviderDriverKind;
  readonly instanceId: string;
  readonly displayName?: string;
  readonly models?: ServerProvider["models"];
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: input.driver,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: input.models ?? [],
    slashCommands: [],
    skills: [],
  };
}

function model(slug: string, name: string, shortName?: string): ServerProvider["models"][number] {
  return {
    slug,
    name,
    ...(shortName ? { shortName } : {}),
    isCustom: false,
    capabilities: null,
  };
}

describe("resolveChatSidebarProviderPresentation", () => {
  it("uses the resolved custom instance name and its model label", () => {
    const instanceId = ProviderInstanceId.make("codex_personal");
    const result = resolveChatSidebarProviderPresentation({
      modelSelection: { instanceId, model: "gpt-5.4" },
      serverConfig: {
        providers: [
          provider({
            driver: ProviderDriverKind.make("codex"),
            instanceId: "codex_personal",
            displayName: "Personal Codex",
            models: [model("gpt-5.4", "GPT-5.4", "5.4")],
          }),
        ],
      },
    });

    expect(result).toEqual({
      providerDisplayName: "Personal Codex",
      modelLabel: "5.4",
      instanceId,
      driverKind: ProviderDriverKind.make("codex"),
    });
  });

  it("uses the default provider display name and model name", () => {
    const result = resolveChatSidebarProviderPresentation({
      modelSelection: {
        instanceId: ProviderInstanceId.make("claudeAgent"),
        model: "claude-opus-4-8",
      },
      serverConfig: {
        providers: [
          provider({
            driver: ProviderDriverKind.make("claudeAgent"),
            instanceId: "claudeAgent",
            displayName: "Claude",
            models: [model("claude-opus-4-8", "Claude Opus 4.8")],
          }),
        ],
      },
    });

    expect(result).toMatchObject({
      providerDisplayName: "Claude",
      modelLabel: "Claude Opus 4.8",
      driverKind: ProviderDriverKind.make("claudeAgent"),
    });
  });

  it("falls back to selection labels when the provider snapshot is missing", () => {
    const result = resolveChatSidebarProviderPresentation({
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
      },
      serverConfig: { providers: [] },
    });

    expect(result).toEqual({
      providerDisplayName: "Codex",
      modelLabel: "gpt-5.4",
      instanceId: ProviderInstanceId.make("codex"),
      driverKind: null,
    });
  });
});
