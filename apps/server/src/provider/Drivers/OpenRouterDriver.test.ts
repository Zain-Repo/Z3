import { describe, expect, it } from "@effect/vitest";

import { applyStrictUnifiedPatch } from "./OpenRouterDriver.ts";

describe("applyStrictUnifiedPatch", () => {
  it("applies a single-file patch with strict context matching", () => {
    expect(
      applyStrictUnifiedPatch(
        "one\ntwo\nthree\n",
        "--- a/file.txt\n+++ b/file.txt\n@@ -1,3 +1,3 @@\n one\n-two\n+changed\n three\n",
      ),
    ).toBe("one\nchanged\nthree\n");
  });

  it("rejects mismatched context and multi-file patches", () => {
    expect(() =>
      applyStrictUnifiedPatch("one\n", "--- a/file.txt\n+++ b/file.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n"),
    ).toThrow("context does not match");
    expect(() =>
      applyStrictUnifiedPatch(
        "one\n",
        "--- a/one.txt\n+++ b/one.txt\n--- a/two.txt\n+++ b/two.txt\n",
      ),
    ).toThrow("exactly one file");
  });
});
