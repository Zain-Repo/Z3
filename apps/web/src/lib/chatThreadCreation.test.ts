import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import { resolveChatEnvironmentId } from "./chatThreadCreation";

const primaryEnvironmentId = EnvironmentId.make("environment-primary");
const secondaryEnvironmentId = EnvironmentId.make("environment-secondary");

describe("resolveChatEnvironmentId", () => {
  it("uses a valid persisted selection before active environment state", () => {
    expect(
      resolveChatEnvironmentId(secondaryEnvironmentId, primaryEnvironmentId, primaryEnvironmentId, [
        primaryEnvironmentId,
        secondaryEnvironmentId,
      ]),
    ).toBe(secondaryEnvironmentId);
  });

  it("falls back when persisted selection is no longer available", () => {
    expect(
      resolveChatEnvironmentId(
        "environment-removed",
        primaryEnvironmentId,
        secondaryEnvironmentId,
        [primaryEnvironmentId, secondaryEnvironmentId],
      ),
    ).toBe(primaryEnvironmentId);
  });
});
