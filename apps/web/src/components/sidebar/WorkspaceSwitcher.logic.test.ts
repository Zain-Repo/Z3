import { describe, expect, it } from "@effect/vitest";

import { shouldResetWorkspaceRoute } from "./WorkspaceSwitcher.logic";

describe("shouldResetWorkspaceRoute", () => {
  it("does not reload the index route when it already renders the destination workspace", () => {
    expect(shouldResetWorkspaceRoute("/", "code", "image")).toBe(false);
    expect(shouldResetWorkspaceRoute("/", "image", "code")).toBe(false);
    expect(shouldResetWorkspaceRoute("/", "code", "chat")).toBe(false);
  });

  it("resets nested routes when entering or leaving a dedicated workspace", () => {
    expect(shouldResetWorkspaceRoute("/thread/$threadId", "code", "image")).toBe(true);
    expect(shouldResetWorkspaceRoute("/thread/$threadId", "chat", "code")).toBe(true);
    expect(shouldResetWorkspaceRoute("/settings", "image", "chat")).toBe(true);
  });

  it("does not navigate for a no-op selection or a code-only transition", () => {
    expect(shouldResetWorkspaceRoute("/thread/$threadId", "chat", "chat")).toBe(false);
    expect(shouldResetWorkspaceRoute("/thread/$threadId", "code", "code")).toBe(false);
  });
});
