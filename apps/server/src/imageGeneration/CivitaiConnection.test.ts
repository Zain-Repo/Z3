import { describe, expect, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { resolveCivitaiApiKey } from "./CivitaiConnection.ts";

const instanceId = ProviderInstanceId.make("civitai");
const instance = {
  driver: ProviderDriverKind.make("civitai"),
  enabled: true,
  environment: [{ name: "CIVITAI_API_KEY", value: " test-key ", sensitive: true }],
};
const settings = {
  ...DEFAULT_SERVER_SETTINGS,
  providerInstances: {
    [instanceId]: {
      driver: ProviderDriverKind.make("civitai"),
      enabled: true,
      environment: [{ name: "CIVITAI_API_KEY", value: " test-key ", sensitive: true }],
    },
  },
};

describe("resolveCivitaiApiKey", () => {
  it("reads the selected Civitai instance's protected environment", () => {
    expect(resolveCivitaiApiKey(settings, instanceId)).toBe("test-key");
  });

  it("rejects missing, disabled, and different-provider instances", () => {
    expect(resolveCivitaiApiKey(DEFAULT_SERVER_SETTINGS, instanceId)).toBeUndefined();
    for (const override of [
      { enabled: false },
      { driver: ProviderDriverKind.make("openrouter") },
    ]) {
      expect(
        resolveCivitaiApiKey(
          {
            ...settings,
            providerInstances: {
              [instanceId]: { ...instance, ...override },
            },
          },
          instanceId,
        ),
      ).toBeUndefined();
    }
  });

  it("never treats a redacted client value as a credential", () => {
    expect(
      resolveCivitaiApiKey(
        {
          ...settings,
          providerInstances: {
            [instanceId]: {
              ...instance,
              environment: [
                { name: "CIVITAI_API_KEY", value: "", sensitive: true, valueRedacted: true },
              ],
            },
          },
        },
        instanceId,
      ),
    ).toBeUndefined();
  });
});
