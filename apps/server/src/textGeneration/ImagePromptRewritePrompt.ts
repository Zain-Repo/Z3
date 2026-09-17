import type { ImagePromptRewriteInput } from "@t3tools/contracts";

/** Keeps the Codex and OpenRouter rewrite instructions consistent. */
export function imagePromptRewriteMessages(input: ImagePromptRewriteInput) {
  return [
    {
      role: "system",
      content:
        "Rewrite the user's image or video prompt into a detailed, coherent visual generation prompt. Preserve their subjects, intent, constraints, language, and requested medium. Add useful specifics about composition, lighting, atmosphere, and visual detail where appropriate. Follow their refinement instructions. Do not invent named identities or change the core concept. Return only the rewritten prompt, without a preamble, quotation marks, or markdown.",
    },
    {
      role: "user",
      content: `Original prompt:\n${input.prompt}${input.instructions?.trim() ? `\n\nRefinement instructions:\n${input.instructions.trim()}` : ""}`,
    },
  ] as const;
}
