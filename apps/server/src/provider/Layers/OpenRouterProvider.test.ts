import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { OpenRouterSettings } from "@t3tools/contracts";
import {
  checkOpenRouterProvider,
  makePendingOpenRouterProvider,
  openRouterModelCapabilities,
} from "./OpenRouterProvider.ts";

const settings = Schema.decodeSync(OpenRouterSettings)({});

describe("OpenRouterProvider", () => {
  it.effect("uses the configured default model when no API key is present", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkOpenRouterProvider(settings, true, undefined);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.auth.status).toBe("unauthenticated");
      expect(snapshot.models.map((model) => model.slug)).toContain("openai/gpt-4o-mini");
      expect(snapshot.message).toContain("OPENROUTER_API_KEY");
    }),
  );

  it.effect("builds a pending snapshot without contacting the network", () =>
    Effect.gen(function* () {
      const snapshot = yield* makePendingOpenRouterProvider(settings, true);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.installed).toBe(true);
      expect(snapshot.models[0]?.slug).toBe("openai/gpt-4o-mini");
    }),
  );

  it("maps OpenRouter supported parameters into model capabilities", () => {
    expect(
      openRouterModelCapabilities({
        id: "tool/model",
        supportedParameters: ["tools"],
        reasoning: { supported: true },
        inputModalities: ["text", "image"],
      }),
    ).toEqual({
      optionDescriptors: [],
      toolCalling: { tools: true, toolChoice: false },
      reasoning: { supported: true },
      inputModalities: ["text", "image"],
    });
    expect(openRouterModelCapabilities({ id: "unknown/model" })).toBeNull();
  });
});
