import { describe, expect, it } from "@effect/vitest";

import { parseOpenRouterModels } from "./OpenRouterApi.ts";

describe("parseOpenRouterModels", () => {
  it("keeps valid OpenRouter model IDs and ignores malformed entries", () => {
    const models = parseOpenRouterModels({
      data: [
        { id: "openai/gpt-4o-mini", name: "GPT-4o mini", context_length: 128000 },
        { id: " anthropic/claude-3.7-sonnet " },
        { name: "missing id" },
        null,
      ],
    });

    expect(models).toEqual([
      { id: "openai/gpt-4o-mini", name: "GPT-4o mini", contextLength: 128000 },
      { id: "anthropic/claude-3.7-sonnet" },
    ]);
  });

  it("returns an empty catalog for an unexpected response", () => {
    expect(parseOpenRouterModels({ data: "not-an-array" })).toEqual([]);
    expect(parseOpenRouterModels(null)).toEqual([]);
  });
});

