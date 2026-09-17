import { assert, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderInstanceId,
  ProviderDriverKind,
  TextGenerationError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { buildServerProvider } from "../provider/providerSnapshot.ts";
import { rewritePromptWithFallback } from "./PromptRewriteRouting.ts";
import { PromptRewriteError } from "./PromptRewrite.ts";

const instanceId = ProviderInstanceId.make("codex-test");
const driverKind = ProviderDriverKind.make("codex");
const snapshot = {
  ...buildServerProvider({
    presentation: { displayName: "Codex" },
    enabled: true,
    checkedAt: "2026-09-14T00:00:00Z",
    models: [
      { slug: "test-default", name: "Test", isCustom: false, isDefault: true, capabilities: null },
    ],
    probe: { installed: true, version: null, status: "ready", auth: { status: "unknown" } },
  }),
  instanceId,
  driver: driverKind,
};
const settings = {
  ...DEFAULT_SERVER_SETTINGS,
  textGenerationModelSelection: { instanceId, model: "background-model" },
};
const input = { prompt: "A cup", instructions: "Daylight" };

it.effect(
  "uses the configured Codex background model with unknown auth without contacting OpenRouter",
  () =>
    Effect.gen(function* () {
      let openRouterCalls = 0;
      const result = yield* rewritePromptWithFallback(
        input,
        settings,
        [
          {
            instanceId,
            driverKind,
            enabled: true,
            snapshot: { getSnapshot: Effect.succeed(snapshot) },
            textGeneration: {
              rewriteImagePrompt: (request) => {
                assert.equal(request.modelSelection.model, "background-model");
                assert.equal(request.instructions, "Daylight");
                return Effect.succeed({ prompt: "A cup in soft daylight." });
              },
            },
          },
        ],
        () => {
          openRouterCalls++;
          return Effect.succeed({ prompt: "Fallback" });
        },
      );
      assert.equal(result.prompt, "A cup in soft daylight.");
      assert.equal(openRouterCalls, 0);
    }),
);

it.effect("waits for Codex failure before falling back to OpenRouter", () =>
  Effect.gen(function* () {
    const calls: string[] = [];
    const result = yield* rewritePromptWithFallback(
      input,
      settings,
      [
        {
          instanceId,
          driverKind,
          enabled: true,
          snapshot: { getSnapshot: Effect.succeed(snapshot) },
          textGeneration: {
            rewriteImagePrompt: () =>
              Effect.sync(() => {
                calls.push("codex");
              }).pipe(
                Effect.andThen(
                  Effect.fail(
                    new TextGenerationError({
                      operation: "rewriteImagePrompt",
                      detail: "Unavailable",
                    }),
                  ),
                ),
              ),
          },
        },
      ],
      () =>
        Effect.sync(() => {
          calls.push("openrouter");
          return { prompt: "Fallback" };
        }),
    );
    assert.equal(result.prompt, "Fallback");
    assert.deepEqual(calls, ["codex", "openrouter"]);
  }),
);

it.effect("falls back when no Codex is available and preserves useful provider errors", () =>
  Effect.gen(function* () {
    const error = yield* rewritePromptWithFallback(input, settings, [], () =>
      Effect.fail(new PromptRewriteError({ message: "OpenRouter has insufficient credits." })),
    ).pipe(Effect.flip);
    assert.include(error.message, "Sign in to Codex");
    assert.include(error.message, "insufficient credits");
  }),
);

it.effect("validates prompt input before attempting either provider", () =>
  Effect.gen(function* () {
    let calls = 0;
    yield* rewritePromptWithFallback({ prompt: " " }, settings, [], () => {
      calls++;
      return Effect.succeed({ prompt: "Fallback" });
    }).pipe(Effect.flip);
    assert.equal(calls, 0);
  }),
);
