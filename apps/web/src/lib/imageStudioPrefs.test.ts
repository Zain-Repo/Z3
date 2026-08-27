import { assert, describe, it } from "@effect/vitest";

import {
  pickStarterPrompt,
  pushPromptHistory,
  STARTER_PROMPTS,
} from "./imageStudioPrefs";

describe("image studio prompt history", () => {
  it("prepends prompts and deduplicates", () => {
    assert.deepEqual(pushPromptHistory([], "A red panda"), ["A red panda"]);
    assert.deepEqual(
      pushPromptHistory(["A red panda", "A blue fox"], "A red panda"),
      ["A red panda", "A blue fox"],
    );
    assert.deepEqual(
      pushPromptHistory(["A blue fox"], "A green owl"),
      ["A green owl", "A blue fox"],
    );
  });

  it("ignores blank prompts", () => {
    assert.deepEqual(pushPromptHistory(["A red panda"], "   "), ["A red panda"]);
  });

  it("caps the history at twelve entries", () => {
    const history = Array.from({ length: 12 }, (_, index) => `Prompt ${index}`);
    const next = pushPromptHistory(history, "Newest prompt");
    assert.equal(next.length, 12);
    assert.equal(next[0], "Newest prompt");
    assert.equal(next.at(-1), "Prompt 10");
  });

  it("offers curated starter prompts and avoids repeating the current one", () => {
    assert.ok(STARTER_PROMPTS.length > 4);
    const picked = pickStarterPrompt(STARTER_PROMPTS[0] ?? "");
    assert.ok(STARTER_PROMPTS.includes(picked));
    assert.notEqual(picked, STARTER_PROMPTS[0]);
  });
});
