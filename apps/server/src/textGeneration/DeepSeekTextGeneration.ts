import { TextGenerationError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { TextGeneration } from "./TextGeneration.ts";

/**
 * Direct DeepSeek chat is text-only in the initial driver slice. The
 * provider contract still requires a text-generation service, so unsupported
 * source-control operations fail explicitly and use the normal UI fallback.
 */
export function makeDeepSeekTextGeneration(): Effect.Effect<TextGeneration["Service"]> {
  const unsupported = (operation: string) =>
    Effect.fail(
      new TextGenerationError({
        operation,
        detail: "DeepSeek source-control text generation is not available in the direct driver yet.",
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
