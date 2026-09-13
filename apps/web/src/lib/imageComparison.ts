import type { ImageGenerationInput } from "@t3tools/contracts";

export const MAX_COMPARISON_MODELS = 4;

export function comparisonModelKey(input: ImageGenerationInput): string {
  return `${input.providerInstanceId ?? "openrouter"}:${input.model}`;
}

/** Snapshot each model's settings while sharing the prompt at submission time. */
export function comparisonInputs(
  models: ReadonlyArray<ImageGenerationInput>,
  prompt: string,
): ReadonlyArray<ImageGenerationInput> {
  if (!prompt.trim()) throw new Error("Enter a prompt before comparing models.");
  if (models.length < 2 || models.length > MAX_COMPARISON_MODELS) {
    throw new Error(`Select between 2 and ${MAX_COMPARISON_MODELS} models to compare.`);
  }
  if (new Set(models.map(comparisonModelKey)).size !== models.length) {
    throw new Error("Each comparison model must be unique.");
  }
  return models.map((input) => ({ ...input, prompt: prompt.trim() }));
}

/** Deliver successes immediately, and isolate failures so other models can finish. */
export async function runImageComparison<T>(
  inputs: ReadonlyArray<ImageGenerationInput>,
  signal: AbortSignal,
  generate: (input: ImageGenerationInput) => Promise<T>,
  onSuccess: (result: T) => void,
  onSettled: (input: ImageGenerationInput) => void,
): Promise<ReadonlyArray<string>> {
  const results = await Promise.all(
    inputs.map(async (input) => {
      if (signal.aborted) return null;
      try {
        const result = await generate(input);
        if (!signal.aborted) onSuccess(result);
        return null;
      } catch (cause) {
        return signal.aborted
          ? null
          : `${input.model}: ${cause instanceof Error ? cause.message : "Generation failed."}`;
      } finally {
        if (!signal.aborted) onSettled(input);
      }
    }),
  );
  return results.filter((result): result is string => result !== null);
}
