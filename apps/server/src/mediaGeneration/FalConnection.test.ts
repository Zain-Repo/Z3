import { describe, expect, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { resolveFalApiKey } from "./FalConnection.ts";

describe("resolveFalApiKey", () => {
  it("resolves only enabled fal credentials from protected provider settings", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [ProviderInstanceId.make("fal")]: {
          driver: ProviderDriverKind.make("fal"),
          enabled: true,
          config: {},
          environment: [{ name: "FAL_KEY", value: " test-key ", sensitive: true }],
        },
      },
    };
    expect(resolveFalApiKey(settings)).toBe("test-key");
    expect(resolveFalApiKey(DEFAULT_SERVER_SETTINGS)).toBeUndefined();
    settings.providerInstances[ProviderInstanceId.make("fal")]!.enabled = false;
    expect(resolveFalApiKey(settings)).toBeUndefined();
  });
});
