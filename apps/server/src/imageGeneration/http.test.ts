import { assert, it } from "@effect/vitest";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import {
  AuthOrchestrationOperateScope,
  AuthSessionId,
  EnvironmentAuthenticatedAuth,
  EnvironmentAuthenticatedPrincipal,
  EnvironmentHttpApi,
  type AuthEnvironmentScope,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpApiTest } from "effect/unstable/httpapi";
import { ImageGenerationService } from "./ImageGenerationService.ts";
import { imageGenerationHttpApiLayer } from "./http.ts";

const clientFor = Effect.fn("test.promptRewrite.client")(function* (
  scopes: ReadonlyArray<AuthEnvironmentScope>,
  onRewrite: () => void,
) {
  const defaults = yield* ImageGenerationService;
  return yield* HttpApiTest.groups(EnvironmentHttpApi, ["imageGeneration"]).pipe(
    Effect.provide([
      NodeHttpServer.layerHttpServices,
      imageGenerationHttpApiLayer.pipe(
        Layer.provide(
          Layer.succeed(ImageGenerationService, {
            ...defaults,
            rewritePrompt: (input) =>
              Effect.sync(() => {
                onRewrite();
                return { prompt: `Detailed: ${input.prompt}` };
              }),
          }),
        ),
      ),
    ]),
    Effect.provideService(EnvironmentAuthenticatedAuth, (effect) =>
      effect.pipe(
        Effect.provideService(EnvironmentAuthenticatedPrincipal, {
          sessionId: AuthSessionId.make("rewrite-test"),
          subject: "test-client",
          method: "browser-session-cookie",
          scopes: new Set(scopes),
          expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
        }),
      ),
    ),
  );
});

it.effect("serves the prompt rewrite route through the authenticated image API", () =>
  Effect.gen(function* () {
    let calls = 0;
    const client = yield* clientFor([AuthOrchestrationOperateScope], () => {
      calls++;
    });
    const result = yield* client.imageGeneration.rewritePrompt({
      headers: {},
      payload: { prompt: "A cup", instructions: "Warm light" },
    });
    assert.deepEqual(result, { prompt: "Detailed: A cup" });
    assert.equal(calls, 1);
  }).pipe(Effect.scoped),
);

it.effect("denies rewriting without operate scope before calling a provider", () =>
  Effect.gen(function* () {
    let calls = 0;
    const client = yield* clientFor([], () => {
      calls++;
    });
    const error = yield* client.imageGeneration
      .rewritePrompt({ headers: {}, payload: { prompt: "A cup" } })
      .pipe(Effect.flip);
    assert.equal(error._tag, "EnvironmentScopeRequiredError");
    assert.equal(calls, 0);
  }).pipe(Effect.scoped),
);
