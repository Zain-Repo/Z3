import {
  DEFAULT_TEXT_GENERATION_MODEL_BY_PROVIDER,
  DEFAULT_TEXT_GENERATION_MODEL,
  type ImagePromptRewriteInput,
  type ImagePromptRewriteResult,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ImagePromptRewriteInput as InputSchema,
  ImagePromptRewriteResult as ResultSchema,
} from "@t3tools/contracts";
import type { ProviderInstance } from "../provider/ProviderDriver.ts";
import { PromptRewriteError } from "./PromptRewrite.ts";

type RewriteProvider = Pick<ProviderInstance, "instanceId" | "driverKind" | "enabled"> & {
  readonly snapshot: Pick<ProviderInstance["snapshot"], "getSnapshot">;
  readonly textGeneration: Pick<ProviderInstance["textGeneration"], "rewriteImagePrompt">;
};
const decodeInput = Schema.decodeUnknownEffect(InputSchema);
const decodeResult = Schema.decodeUnknownEffect(ResultSchema);

/** Attempts account-backed Codex first, then starts the OpenRouter request only after failure. */
export const rewritePromptWithFallback = Effect.fn("imageGeneration.rewritePromptWithFallback")(
  function* (
    input: ImagePromptRewriteInput,
    settings: ServerSettings,
    instances: readonly RewriteProvider[],
    openRouter: (
      input: ImagePromptRewriteInput,
    ) => Effect.Effect<ImagePromptRewriteResult, PromptRewriteError>,
  ) {
    const validated = yield* decodeInput(input).pipe(
      Effect.mapError(
        () =>
          new PromptRewriteError({
            message:
              "Enter a prompt of up to 10,000 characters and instructions of up to 4,000 characters.",
          }),
      ),
    );
    const preferred = settings.textGenerationModelSelection;
    const candidates = instances.filter(
      (instance) =>
        instance.enabled &&
        instance.driverKind === "codex" &&
        instance.textGeneration.rewriteImagePrompt,
    );
    const codex =
      candidates.find((instance) => instance.instanceId === preferred.instanceId) ?? candidates[0];
    if (codex?.textGeneration.rewriteImagePrompt) {
      const snapshot = yield* codex.snapshot.getSnapshot;
      if (snapshot.auth.status !== "unauthenticated") {
        const modelSelection =
          preferred.instanceId === codex.instanceId
            ? preferred
            : {
                instanceId: codex.instanceId,
                model:
                  snapshot.models.find((model) => model.isDefault)?.slug ??
                  snapshot.models[0]?.slug ??
                  DEFAULT_TEXT_GENERATION_MODEL_BY_PROVIDER[codex.driverKind] ??
                  DEFAULT_TEXT_GENERATION_MODEL,
              };
        const result = yield* codex.textGeneration
          .rewriteImagePrompt({ ...validated, modelSelection })
          .pipe(Effect.flatMap(decodeResult), Effect.timeout("60 seconds"), Effect.result);
        if (result._tag === "Success") return result.success;
      }
    }
    return yield* openRouter(validated).pipe(
      Effect.mapError(
        (error) =>
          new PromptRewriteError({
            message: `Prompt rewriting could not use Codex or OpenRouter. Sign in to Codex or configure OpenRouter in Settings > Providers. ${error.message}`,
          }),
      ),
    );
  },
);
