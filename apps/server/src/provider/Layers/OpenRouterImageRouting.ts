import type { OpenRouterImageModelEndpoint } from "./OpenRouterApi.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ImageModelRouting {
  readonly only?: ReadonlyArray<string>;
  readonly order?: ReadonlyArray<string>;
  readonly allowFallbacks: boolean;
}

function pin(provider: string): ImageModelRouting {
  return { only: [provider], allowFallbacks: false };
}

function prefer(primary: string, ...fallbacks: ReadonlyArray<string>): ImageModelRouting {
  return { order: [primary, ...fallbacks], allowFallbacks: true };
}

/**
 * Preferred OpenRouter provider per image model, grounded in the live
 * endpoint catalog. Single-provider models are pinned so OpenRouter never
 * picks a flaky fallback; Gemini models prefer Google AI Studio (the standard
 * BYOK route) with Vertex as a fallback. Provider slugs match by base name,
 * so `google-ai-studio` also covers `google-ai-studio/global` and
 * `black-forest-labs` covers `black-forest-labs/us-3`.
 */
const CURATED_ROUTING: Readonly<Record<string, ImageModelRouting>> = {
  // OpenAI
  "openai/gpt-image-2": pin("openai"),
  "openai/gpt-image-1": pin("openai"),
  "openai/gpt-image-1-mini": pin("openai"),
  "openai/gpt-5-image": pin("openai"),
  "openai/gpt-5-image-mini": pin("openai"),
  "openai/gpt-5.4-image-2": pin("openai"),
  // Google Gemini
  "google/gemini-2.5-flash-image": prefer("google-ai-studio", "google-vertex"),
  "google/gemini-3.1-flash-image": prefer("google-ai-studio", "google-vertex"),
  "google/gemini-3.1-flash-image-preview": prefer("google-ai-studio", "google-vertex"),
  "google/gemini-3.1-flash-lite-image": prefer("google-ai-studio", "google-vertex"),
  "google/gemini-3-pro-image": prefer("google-ai-studio", "google-vertex"),
  "google/gemini-3-pro-image-preview": prefer("google-ai-studio", "google-vertex"),
  // ByteDance Seed
  "bytedance-seed/seedream-4.5": pin("seed"),
  "bytedance-seed/seedream-5-0-pro": pin("seed"),
  "bytedance-seed/seedream-5-0-lite": pin("seed"),
  // Black Forest Labs
  "black-forest-labs/flux.2-pro": pin("black-forest-labs"),
  "black-forest-labs/flux.2-klein-4b": pin("black-forest-labs"),
  "black-forest-labs/flux.2-max": pin("black-forest-labs"),
  "black-forest-labs/flux.2-flex": pin("black-forest-labs"),
  // xAI Grok Imagine
  "x-ai/grok-imagine-image-2.0": pin("xai"),
  "x-ai/grok-imagine-image-quality": pin("xai"),
  // Qwen
  "qwen/qwen-image-3": pin("alibaba"),
  "qwen/qwen-image-3-pro": pin("alibaba"),
  // Microsoft MAI-Image
  "microsoft/mai-image-2.5": pin("azure"),
  "microsoft/mai-image-2.5-pro": pin("azure"),
  // Krea
  "krea/krea-2-large": pin("krea"),
  "krea/krea-2-medium": pin("krea"),
  "krea/krea-2-medium-turbo": pin("krea"),
  // Recraft
  "recraft/recraft-v3": pin("recraft"),
  "recraft/recraft-v4": pin("recraft"),
  "recraft/recraft-v4-pro": pin("recraft"),
  "recraft/recraft-v4-vector": pin("recraft"),
  "recraft/recraft-v4-pro-vector": pin("recraft"),
  "recraft/recraft-v4.1": pin("recraft"),
  "recraft/recraft-v4.1-pro": pin("recraft"),
  "recraft/recraft-v4.1-utility": pin("recraft"),
  "recraft/recraft-v4.1-utility-pro": pin("recraft"),
  "recraft/recraft-v4.1-vector": pin("recraft"),
  "recraft/recraft-v4.1-pro-vector": pin("recraft"),
  "recraft/recraft-v4-styles": pin("recraft"),
  "recraft/recraft-v4-styles-pro": pin("recraft"),
  "recraft/recraft-v4-styles-vector": pin("recraft"),
  "recraft/recraft-v4-styles-pro-vector": pin("recraft"),
  // Sourceful Riverflow
  "sourceful/riverflow-v2-pro": pin("sourceful"),
  "sourceful/riverflow-v2-fast": pin("sourceful"),
  "sourceful/riverflow-v2.5-pro": pin("sourceful"),
  "sourceful/riverflow-v2.5-fast": pin("sourceful"),
};

function asRoutingProvider(routing: ImageModelRouting): Readonly<Record<string, unknown>> {
  return {
    ...(routing.only !== undefined ? { only: [...routing.only] } : {}),
    ...(routing.order !== undefined ? { order: [...routing.order] } : {}),
    allow_fallbacks: routing.allowFallbacks,
  };
}

const ROUTING_KEYS = new Set([
  "only",
  "order",
  "ignore",
  "sort",
  "allow_fallbacks",
  "require_parameters",
  "data_collection",
  "zdr",
]);

function hasRoutingKeys(provider: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(provider).some((key) => ROUTING_KEYS.has(key));
}

/**
 * Resolves the provider object to send for an image generation request.
 *
 * Precedence: an explicit user routing choice wins; otherwise the curated
 * per-model default applies; otherwise a single-provider model is pinned to
 * that provider. Provider-specific `options` from the user are preserved in
 * every case. Returns undefined when OpenRouter's automatic routing is best.
 */
export function resolveImageModelRouting(
  model: string,
  userProvider: Readonly<Record<string, unknown>> | undefined,
  endpoints: ReadonlyArray<OpenRouterImageModelEndpoint>,
): Readonly<Record<string, unknown>> | undefined {
  const userOptions =
    userProvider !== undefined && isRecord(userProvider.options)
      ? userProvider.options
      : undefined;

  if (userProvider !== undefined && hasRoutingKeys(userProvider)) {
    return userProvider;
  }

  const curated = CURATED_ROUTING[model];
  const singleEndpoint = endpoints.length === 1 ? endpoints[0] : undefined;
  const routing =
    curated ??
    (singleEndpoint?.providerSlug !== undefined ? pin(singleEndpoint.providerSlug) : undefined);

  if (routing === undefined && userOptions === undefined) return undefined;

  const provider: Record<string, unknown> =
    routing !== undefined ? { ...asRoutingProvider(routing) } : {};
  if (userOptions !== undefined) provider.options = userOptions;
  return Object.keys(provider).length > 0 ? provider : undefined;
}
