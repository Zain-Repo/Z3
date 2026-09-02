import { describe, expect, it } from "@effect/vitest";

import { resolveImageModelRouting } from "./OpenRouterImageRouting.ts";
import type { OpenRouterImageModelEndpoint } from "./OpenRouterApi.ts";

function endpoint(providerSlug: string): OpenRouterImageModelEndpoint {
  return {
    providerSlug,
    allowedPassthroughParameters: [],
    supportedParameters: {},
    supportsStreaming: false,
    pricing: [],
  };
}

describe("OpenRouter image model routing", () => {
  it("pins OpenAI image models to the OpenAI provider", () => {
    expect(resolveImageModelRouting("openai/gpt-image-2", undefined, [endpoint("openai")])).toEqual(
      { only: ["openai"], allow_fallbacks: false },
    );
    expect(
      resolveImageModelRouting("openai/gpt-5-image", undefined, [endpoint("openai")]),
    ).toEqual({ only: ["openai"], allow_fallbacks: false });
  });

  it("prefers Google AI Studio with Vertex as a fallback for Gemini models", () => {
    expect(
      resolveImageModelRouting("google/gemini-2.5-flash-image", undefined, [
        endpoint("google-ai-studio"),
        endpoint("google-vertex/global"),
      ]),
    ).toEqual({
      order: ["google-ai-studio", "google-vertex"],
      allow_fallbacks: true,
    });
  });

  it("pins single-provider model families to their source provider", () => {
    const cases: ReadonlyArray<[string, string]> = [
      ["bytedance-seed/seedream-4.5", "seed"],
      ["black-forest-labs/flux.2-pro", "black-forest-labs"],
      ["x-ai/grok-imagine-image-2.0", "xai"],
      ["qwen/qwen-image-3", "alibaba"],
      ["microsoft/mai-image-2.5", "azure"],
      ["krea/krea-2-large", "krea"],
      ["recraft/recraft-v4-styles-pro-vector", "recraft"],
      ["sourceful/riverflow-v2.5-fast", "sourceful"],
    ];
    for (const [model, provider] of cases) {
      expect(resolveImageModelRouting(model, undefined, [endpoint(provider)])).toEqual({
        only: [provider],
        allow_fallbacks: false,
      });
    }
  });

  it("pins an unknown single-endpoint model to its only provider", () => {
    expect(
      resolveImageModelRouting("some-lab/new-image-model", undefined, [endpoint("some-lab")]),
    ).toEqual({ only: ["some-lab"], allow_fallbacks: false });
  });

  it("lets OpenRouter route unknown multi-provider models automatically", () => {
    expect(
      resolveImageModelRouting("some-lab/new-image-model", undefined, [
        endpoint("provider-a"),
        endpoint("provider-b"),
      ]),
    ).toBeUndefined();
  });

  it("lets an explicit user routing choice win over the curated default", () => {
    expect(
      resolveImageModelRouting("google/gemini-2.5-flash-image", { order: ["google-vertex"] }, [
        endpoint("google-ai-studio"),
        endpoint("google-vertex/global"),
      ]),
    ).toEqual({ order: ["google-vertex"] });
  });

  it("preserves provider options while applying the curated routing", () => {
    expect(
      resolveImageModelRouting(
        "google/gemini-2.5-flash-image",
        { options: { "google-ai-studio": { safety_level: "high" } } },
        [endpoint("google-ai-studio"), endpoint("google-vertex/global")],
      ),
    ).toEqual({
      order: ["google-ai-studio", "google-vertex"],
      allow_fallbacks: true,
      options: { "google-ai-studio": { safety_level: "high" } },
    });
  });

  it("returns undefined for a model with no endpoints", () => {
    expect(resolveImageModelRouting("some-lab/new-image-model", undefined, [])).toBeUndefined();
  });

  it("lets Muse Image use OpenRouter routing when endpoint metadata is unavailable", () => {
    expect(resolveImageModelRouting("meta/muse-image", undefined, [])).toBeUndefined();
  });
});
