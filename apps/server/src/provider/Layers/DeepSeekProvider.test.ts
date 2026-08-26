import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { DeepSeekSettings } from "@t3tools/contracts";
import {
  checkDeepSeekProvider,
  deepSeekModelCapabilities,
  makePendingDeepSeekProvider,
} from "./DeepSeekProvider.ts";

const settings = Schema.decodeSync(DeepSeekSettings)({});

describe("DeepSeekProvider", () => {
  it("describes the official DeepSeek vision model as multimodal", () => {
    expect(deepSeekModelCapabilities("deepseek-v4-flash-vision-exp")).toMatchObject({
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
    });
    expect(deepSeekModelCapabilities("deepseek-v4-flash")).toMatchObject({
      inputModalities: ["text"],
    });
  });

  it.effect("keeps the vision model selectable when the models response omits it", () =>
    Effect.gen(function* () {
      const httpClient = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({ data: [{ id: "deepseek-v4-flash" }] }),
          ),
        ),
      );
      const snapshot = yield* checkDeepSeekProvider(settings, true, "test-key", httpClient);
      const visionModel = snapshot.models.find(
        (model) => model.slug === "deepseek-v4-flash-vision-exp",
      );
      expect(visionModel).toMatchObject({
        isCustom: false,
        capabilities: { inputModalities: ["text", "image"] },
      });
    }),
  );

  it.effect("uses the configured default model when no API key is present", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkDeepSeekProvider(settings, true, undefined);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.auth.status).toBe("unauthenticated");
      expect(snapshot.models.map((model) => model.slug)).toContain("deepseek-v4-flash");
      expect(snapshot.models.map((model) => model.slug)).toContain("deepseek-v4-flash-vision-exp");
      expect(snapshot.message).toContain("DEEPSEEK_API_KEY");
    }),
  );

  it.effect("builds a pending snapshot without contacting the network", () =>
    Effect.gen(function* () {
      const snapshot = yield* makePendingDeepSeekProvider(settings, true);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.installed).toBe(true);
      expect(snapshot.models[0]?.slug).toBe("deepseek-v4-flash");
    }),
  );
});
