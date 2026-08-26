import { ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import {
  isDeepSeekVisionModel,
  normalizeDeepSeekImageMimeType,
  streamDeepSeekCompletion,
} from "./DeepSeekApi.ts";
import {
  makeOpenAICompatibleAdapter,
  type OpenAICompatibleAdapterConfig,
  type OpenRouterToolSupport,
} from "./OpenRouterAdapter.ts";

export const DEEPSEEK_DIRECT_IMAGE_SUPPORT_MESSAGE =
  "DeepSeek image attachments require the deepseek-v4-flash-vision-exp model. Select that model and try again.";

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
  readonly fileSystem: FileSystem.FileSystem;
  readonly attachmentsDir: string;
  readonly streamCompletion?: OpenAICompatibleAdapterConfig["streamCompletion"];
  readonly toolSupport?: OpenRouterToolSupport;
}) =>
  makeOpenAICompatibleAdapter({
    ...config,
    provider: ProviderDriverKind.make("deepseek"),
    providerLabel: "DeepSeek",
    idPrefix: "deepseek",
    fileSystem: config.fileSystem,
    attachmentsDir: config.attachmentsDir,
    attachmentModelUnsupportedReason: () => DEEPSEEK_DIRECT_IMAGE_SUPPORT_MESSAGE,
    attachmentMimeTypeNormalizer: normalizeDeepSeekImageMimeType,
    getModelCapabilities: (model) =>
      Effect.succeed({
        inputModalities: isDeepSeekVisionModel(model) ? ["text", "image"] : ["text"],
      }),
    supportsTools: true,
    reasoningMessageField: "reasoning_content",
    ...(config.toolSupport ? { toolSupport: config.toolSupport } : {}),
    streamCompletion: config.streamCompletion ?? ((input) => streamDeepSeekCompletion(input)),
  });
