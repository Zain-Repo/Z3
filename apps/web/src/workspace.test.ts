import { describe, expect, it } from "@effect/vitest";

import { DEFAULT_WORKSPACE_ID, getWorkspaceDefinition, WORKSPACE_DEFINITIONS } from "./workspace";

describe("workspace definitions", () => {
  it("starts in Z3Code", () => {
    expect(getWorkspaceDefinition(DEFAULT_WORKSPACE_ID).label).toBe("Z3Code");
  });

  it("defines the available workspaces in switcher order", () => {
    expect(WORKSPACE_DEFINITIONS.map((workspace) => workspace.label)).toEqual([
      "Z3Code",
      "Z3Chat",
      "Z3Image",
    ]);
  });

  it("keeps Z3Image disabled until its workspace is ready", () => {
    expect(getWorkspaceDefinition("image").disabled).toBe(true);
  });
});
