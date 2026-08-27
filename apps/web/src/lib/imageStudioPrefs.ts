const PROMPT_HISTORY_KEY = "zimage:prompt-history:v1";
const PROMPT_HISTORY_LIMIT = 12;

export const STARTER_PROMPTS: ReadonlyArray<string> = [
  "A cozy reading nook at golden hour, warm lamp light, overflowing bookshelves, cinematic depth of field, photorealistic",
  "A minimalist brand logo for a coffee roaster, clean geometric mark, soft cream background, flat vector style",
  "A retro-futuristic city street in the rain at night, neon signs reflecting on wet asphalt, cinematic wide shot",
  "A watercolor fox curled asleep in autumn leaves, soft pastel palette, delicate paper texture, top-down view",
  "A macro photograph of a dewdrop on a fern leaf, shallow depth of field, morning light, ultra detailed",
  "An isometric illustration of a tiny cozy cabin in a pine forest, soft shadows, warm evening light, game asset style",
];

export function loadPromptHistory(): ReadonlyArray<string> {
  try {
    const raw = window.localStorage.getItem(PROMPT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string").slice(0, PROMPT_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Adds a prompt to the front of the history, deduplicates, and caps the list.
 * Returns the updated history without touching storage so callers can test
 * the ordering logic.
 */
export function pushPromptHistory(
  history: ReadonlyArray<string>,
  prompt: string,
): ReadonlyArray<string> {
  const trimmed = prompt.trim();
  if (!trimmed) return history;
  return [trimmed, ...history.filter((entry) => entry.trim() !== trimmed)].slice(0, PROMPT_HISTORY_LIMIT);
}

export function clearPromptHistory(): void {
  try {
    window.localStorage.removeItem(PROMPT_HISTORY_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); history is optional.
  }
}

export function persistPromptHistory(history: ReadonlyArray<string>): void {
  try {
    window.localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Optional feature; never block generation because storage is unavailable.
  }
}

export function pickStarterPrompt(current: string): string {
  const candidates = STARTER_PROMPTS.filter((prompt) => prompt !== current.trim());
  const pool = candidates.length > 0 ? candidates : STARTER_PROMPTS;
  return pool[Math.floor(Math.random() * pool.length)] ?? "";
}
