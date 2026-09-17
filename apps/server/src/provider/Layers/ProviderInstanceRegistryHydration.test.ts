import { assert, describe, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { deriveProviderInstanceConfigMap } from "./ProviderInstanceRegistryHydration.ts";

describe("ProviderInstanceRegistryHydration", () => {
  it("keeps media-only provider credentials out of the coding provider registry", () => {
    const map = deriveProviderInstanceConfigMap({
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [ProviderInstanceId.make("fal")]: { driver: ProviderDriverKind.make("fal"), config: {} },
        [ProviderInstanceId.make("civitai")]: {
          driver: ProviderDriverKind.make("civitai"),
          config: {},
        },
        [ProviderInstanceId.make("future")]: {
          driver: ProviderDriverKind.make("future"),
          config: {},
        },
      },
    });
    assert.notProperty(map, "civitai");
    assert.notProperty(map, "fal");
    assert.property(map, "future");
    assert.property(map, "codex");
  });
});
