import * as NodeAssert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import { buildOpenCodePermissionRules } from "./opencodeRuntime.ts";

function actionFor(
  runtimeMode: Parameters<typeof buildOpenCodePermissionRules>[0],
  permission: string,
) {
  return buildOpenCodePermissionRules(runtimeMode).find((rule) => rule.permission === permission)
    ?.action;
}

describe("buildOpenCodePermissionRules", () => {
  it("pre-approves edits only in auto-accept-edits mode", () => {
    NodeAssert.equal(actionFor("auto-accept-edits", "edit"), "allow");
    NodeAssert.equal(actionFor("approval-required", "edit"), "ask");
    NodeAssert.equal(actionFor("auto", "edit"), "ask");
  });

  it("keeps other permissions supervised", () => {
    for (const permission of ["bash", "webfetch", "external_directory", "*"]) {
      NodeAssert.equal(actionFor("auto-accept-edits", permission), "ask");
    }
  });

  it("allows everything only in full-access mode", () => {
    NodeAssert.deepEqual(buildOpenCodePermissionRules("full-access"), [
      { permission: "*", pattern: "*", action: "allow" },
    ]);
  });
});
