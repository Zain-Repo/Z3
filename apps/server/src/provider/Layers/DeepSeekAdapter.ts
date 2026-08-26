import { ProviderDriverKind } from "@t3tools/contracts";

import { streamDeepSeekCompletion } from "./DeepSeekApi.ts";
import {
  makeOpenAICompatibleAdapter,
  type OpenRouterToolSupport,
} from "./OpenRouterAdapter.ts";

// DeepSeek's direct API does not expose a vision input modality, so image data
// must not be forwarded as if the text-only endpoint could interpret it.
export const DEEPSEEK_DIRECT_IMAGE_SUPPORT_MESSAGE =
  "The direct DeepSeek API currently accepts text input only and does not process image attachments. Select an image-capable model through OpenRouter, such as deepseek/deepseek-v4-flash-vision-exp.";

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
  readonly toolSupport?: OpenRouterToolSupport;
}) =>
  makeOpenAICompatibleAdapter({
    ...config,
    provider: ProviderDriverKind.make("deepseek"),
    providerLabel: "DeepSeek",
    idPrefix: "deepseek",
    attachmentsDisabledReason: DEEPSEEK_DIRECT_IMAGE_SUPPORT_MESSAGE,
    supportsTools: true,
    reasoningMessageField: "reasoning_content",
    ...(config.toolSupport ? { toolSupport: config.toolSupport } : {}),
    streamCompletion: (input) => streamDeepSeekCompletion(input),
  });
