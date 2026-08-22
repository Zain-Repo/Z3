import { TextGenerationError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { TextGeneration } from "./TextGeneration.ts";

/**
 * Direct OpenRouter chat is intentionally text-only in the first driver slice.
 * The provider contract still requires a text-generation service, so these
 * operations fail explicitly and let callers present the normal fallback.
 */
export function makeOpenRouterTextGeneration(): Effect.Effect<TextGeneration["Service"]> {
  const unsupported = (operation: string) =>
    Effect.fail(
      new TextGenerationError({
        operation,
        detail: "OpenRouter source-control text generation is not available in the direct driver yet.",
      }),
    );

  return Effect.succeed(
    TextGeneration.of({
      generateCommitMessage: () => unsupported("generateCommitMessage"),
      generatePrContent: () => unsupported("generatePrContent"),
      generateBranchName: () => unsupported("generateBranchName"),
      generateThreadTitle: () => unsupported("generateThreadTitle"),
    }),
  );
}

