import { ProviderDriverKind } from "@t3tools/contracts";

import { streamDeepSeekCompletion } from "./DeepSeekApi.ts";
import { makeOpenAICompatibleAdapter } from "./OpenRouterAdapter.ts";

/**
 * Build the per-instance DeepSeek session adapter on the shared
 * OpenAI-compatible session runtime. DeepSeek receives its own provider kind
 * and request function so events, errors, and credentials remain isolated
 * from OpenRouter instances.
 */
export const makeDeepSeekAdapter = (config: {
  readonly httpClient: Parameters<typeof makeOpenAICompatibleAdapter>[0]["httpClient"];
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly defaultModel: string;
  readonly instanceId: string;
}) =>
  makeOpenAICompatibleAdapter({
    ...config,
    provider: ProviderDriverKind.make("deepseek"),
    providerLabel: "DeepSeek",
    idPrefix: "deepseek",
    streamCompletion: (input) => streamDeepSeekCompletion(input),
  });
