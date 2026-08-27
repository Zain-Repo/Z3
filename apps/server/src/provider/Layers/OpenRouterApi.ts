// @effect-diagnostics preferSchemaOverJson:off
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

export interface OpenRouterModel {
  readonly id: string;
  readonly name?: string;
  readonly contextLength?: number;
  readonly supportedParameters?: ReadonlyArray<string>;
  readonly reasoning?: OpenRouterReasoningMetadata;
  readonly inputModalities?: ReadonlyArray<string>;
  readonly outputModalities?: ReadonlyArray<string>;
}

export interface OpenRouterReasoningMetadata {
  readonly supported: boolean;
  readonly maxTokens?: number;
  readonly supportedEfforts?: ReadonlyArray<string>;
  readonly defaultEffort?: string;
  readonly defaultEnabled?: boolean;
  readonly mandatory?: boolean;
  readonly supportsMaxTokens?: boolean;
}

const OPENROUTER_GLM_5_3_FLASH_MODEL = "z-ai/glm-5.3-flash";
const OPENROUTER_BASETEN_PROVIDER = "baseten";

export interface OpenRouterImageModel extends OpenRouterModel {
  readonly imageGeneration: {
    readonly supportedParameters: Readonly<Record<string, OpenRouterImageParameterDescriptor>>;
    readonly supportsStreaming: boolean;
    readonly endpoints?: string;
  };
}

export type OpenRouterImageParameterDescriptor =
  | { readonly type: "boolean" }
  | { readonly type: "enum"; readonly values: ReadonlyArray<string> }
  | { readonly type: "range"; readonly min: number; readonly max: number };

export interface OpenRouterImageModelEndpoint {
  readonly providerName?: string;
  readonly providerSlug?: string;
  readonly providerTag?: string;
  readonly allowedPassthroughParameters: ReadonlyArray<string>;
  readonly supportedParameters: Readonly<Record<string, OpenRouterImageParameterDescriptor>>;
  readonly supportsStreaming: boolean;
  readonly pricing: ReadonlyArray<{
    readonly billable: string;
    readonly unit: string;
    readonly costUsd: number;
    readonly variant?: string;
  }>;
}

export interface OpenRouterImageModelEndpoints {
  readonly id: string;
  readonly endpoints: ReadonlyArray<OpenRouterImageModelEndpoint>;
}

export interface OpenRouterImageReference {
  readonly type: "image_url";
  readonly image_url: {
    readonly url: string;
  };
}

export interface OpenRouterImageGenerationInput {
  readonly httpClient: HttpClient.HttpClient;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
  readonly stream?: boolean;
  readonly n?: number;
  readonly resolution?: string;
  readonly aspectRatio?: string;
  readonly size?: string;
  readonly quality?: "auto" | "low" | "medium" | "high";
  readonly outputFormat?: "png" | "jpeg" | "webp" | "svg";
  readonly background?: "auto" | "transparent" | "opaque";
  readonly outputCompression?: number;
  readonly seed?: number;
  readonly inputReferences?: ReadonlyArray<OpenRouterImageReference>;
  readonly provider?: Readonly<Record<string, unknown>>;
}

export interface OpenRouterGeneratedImage {
  readonly b64Json: string;
  readonly mediaType?: string;
  readonly revisedPrompt?: string;
}

export interface OpenRouterImageGenerationResult {
  readonly created?: number;
  readonly data: ReadonlyArray<OpenRouterGeneratedImage>;
  readonly model?: string;
  readonly usage?: unknown;
}

export type OpenRouterVideoStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export interface OpenRouterVideoModel {
  readonly id: string;
  readonly canonicalSlug?: string;
  readonly name?: string;
  readonly description?: string;
  readonly generateAudio: boolean;
  readonly supportsSeed: boolean;
  readonly supportedDurations: ReadonlyArray<number>;
  readonly supportedResolutions: ReadonlyArray<string>;
  readonly supportedAspectRatios: ReadonlyArray<string>;
  readonly supportedFrameImages: ReadonlyArray<"first_frame" | "last_frame">;
  readonly supportedSizes: ReadonlyArray<string>;
  readonly allowedPassthroughParameters: ReadonlyArray<string>;
  readonly pricingSkus: Readonly<Record<string, unknown>>;
}

export interface OpenRouterVideoFrameImage {
  readonly type: "image_url";
  readonly image_url: { readonly url: string };
  readonly frame_type: "first_frame" | "last_frame";
}

export type OpenRouterVideoInputReference =
  | { readonly type: "image_url"; readonly image_url: { readonly url: string } }
  | { readonly type: "audio_url"; readonly audio_url: { readonly url: string } }
  | { readonly type: "video_url"; readonly video_url: { readonly url: string } };

export interface OpenRouterVideoProviderOption {
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface OpenRouterVideoProvider {
  readonly options: Readonly<Record<string, OpenRouterVideoProviderOption>>;
}

export interface OpenRouterVideoGenerationInput {
  readonly httpClient: HttpClient.HttpClient;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
  readonly duration?: number;
  readonly resolution?: string;
  readonly aspectRatio?: string;
  readonly size?: string;
  readonly generateAudio?: boolean;
  readonly seed?: number;
  readonly frameImages?: ReadonlyArray<OpenRouterVideoFrameImage>;
  readonly inputReferences?: ReadonlyArray<OpenRouterVideoInputReference>;
  readonly provider?: OpenRouterVideoProvider;
  readonly callbackUrl?: string;
}

export interface OpenRouterVideoJob {
  readonly id: string;
  readonly generationId?: string;
  readonly pollingUrl?: string;
  readonly status: OpenRouterVideoStatus;
  readonly error?: string;
  readonly unsignedUrls?: ReadonlyArray<string>;
  readonly usage?: unknown;
}

export interface OpenRouterVideoDownload {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

export type OpenRouterMessageContentPart =
  | {
      readonly type: "text";
      readonly text: string;
    }
  | {
      readonly type: "image_url";
      readonly image_url: {
        readonly url: string;
      };
    };

export const OPENROUTER_SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

export function normalizeOpenRouterImageMimeType(mimeType: string): string | undefined {
  const normalized = mimeType.split(";", 1)[0]?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "image/jpg") return "image/jpeg";
  return OPENROUTER_SUPPORTED_IMAGE_MIME_TYPES.has(normalized) ? normalized : undefined;
}

export interface OpenRouterCompletionMessage {
  readonly role: "user" | "assistant" | "system" | "tool";
  readonly content: string | ReadonlyArray<OpenRouterMessageContentPart> | null;
  readonly tool_calls?: ReadonlyArray<OpenRouterToolCall>;
  readonly tool_call_id?: string;
  readonly name?: string;
  readonly reasoning?: string | null;
  readonly reasoning_content?: string | null;
  readonly reasoning_details?: ReadonlyArray<unknown>;
}

export interface OpenRouterToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

export interface OpenRouterToolCallDelta {
  readonly index: number;
  readonly id?: string;
  readonly name?: string;
  readonly argumentsDelta?: string;
}

export interface OpenRouterToolDefinition {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

export interface OpenRouterModelOptionSelection {
  readonly id: string;
  readonly value: string | boolean;
}

export interface OpenRouterCompletionChunk {
  readonly delta: string;
  readonly done: boolean;
  readonly reasoningDelta?: string;
  readonly reasoningDetails?: ReadonlyArray<unknown>;
  readonly model?: string;
  readonly usage?: unknown;
  readonly annotations?: ReadonlyArray<unknown>;
  readonly toolCallDeltas?: ReadonlyArray<OpenRouterToolCallDelta>;
}

export interface OpenRouterEmbeddingInput {
  readonly httpClient: HttpClient.HttpClient;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly inputs: ReadonlyArray<string>;
}

export class OpenRouterApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenRouterApiError";
    this.status = status;
  }
}

const stringValue = (value: unknown): string | undefined =>
  Predicate.isString(value) && value.trim().length > 0 ? value.trim() : undefined;

export function parseOpenRouterModels(payload: unknown): ReadonlyArray<OpenRouterModel> {
  if (!Predicate.isObject(payload) || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap((entry): ReadonlyArray<OpenRouterModel> => {
    if (!Predicate.isObject(entry)) return [];
    const id = stringValue(entry.id);
    if (!id) return [];
    const contextLength =
      typeof entry.context_length === "number" ? entry.context_length : undefined;
    const name = stringValue(entry.name);
    const supportedParameters = Array.isArray(entry.supported_parameters)
      ? entry.supported_parameters.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )
      : undefined;
    const reasoningValue = Predicate.isObject(entry.reasoning) ? entry.reasoning : undefined;
    const reasoningMaxTokens =
      reasoningValue && typeof reasoningValue.max_tokens === "number"
        ? reasoningValue.max_tokens
        : undefined;
    const reasoningSupportedEfforts =
      reasoningValue && Array.isArray(reasoningValue.supported_efforts)
        ? reasoningValue.supported_efforts
            .filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0,
            )
            .map((value) => value.trim())
        : undefined;
    const reasoningDefaultEffort = stringValue(reasoningValue?.default_effort);
    const reasoningDefaultEnabled =
      reasoningValue && typeof reasoningValue.default_enabled === "boolean"
        ? reasoningValue.default_enabled
        : undefined;
    const reasoningMandatory =
      reasoningValue && typeof reasoningValue.mandatory === "boolean"
        ? reasoningValue.mandatory
        : undefined;
    const reasoningSupportsMaxTokens =
      reasoningValue && typeof reasoningValue.supports_max_tokens === "boolean"
        ? reasoningValue.supports_max_tokens
        : undefined;
    const reasoningSupported = reasoningValue
      ? typeof reasoningValue.supported === "boolean"
        ? reasoningValue.supported
        : reasoningMaxTokens !== undefined ||
          reasoningSupportedEfforts !== undefined ||
          reasoningDefaultEffort !== undefined ||
          reasoningDefaultEnabled !== undefined ||
          reasoningMandatory !== undefined ||
          reasoningSupportsMaxTokens !== undefined
      : undefined;
    const architecture = Predicate.isObject(entry.architecture) ? entry.architecture : undefined;
    const inputModalities = Array.isArray(architecture?.input_modalities)
      ? architecture.input_modalities.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )
      : undefined;
    const outputModalities = Array.isArray(architecture?.output_modalities)
      ? architecture.output_modalities.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )
      : undefined;
    return [
      {
        id,
        ...(name !== undefined ? { name } : {}),
        ...(contextLength !== undefined ? { contextLength } : {}),
        ...(supportedParameters?.length ? { supportedParameters } : {}),
        ...(reasoningSupported !== undefined
          ? {
              reasoning: {
                supported: reasoningSupported,
                ...(reasoningMaxTokens !== undefined ? { maxTokens: reasoningMaxTokens } : {}),
                ...(reasoningSupportedEfforts?.length
                  ? { supportedEfforts: reasoningSupportedEfforts }
                  : {}),
                ...(reasoningDefaultEffort !== undefined
                  ? { defaultEffort: reasoningDefaultEffort }
                  : {}),
                ...(reasoningDefaultEnabled !== undefined
                  ? { defaultEnabled: reasoningDefaultEnabled }
                  : {}),
                ...(reasoningMandatory !== undefined ? { mandatory: reasoningMandatory } : {}),
                ...(reasoningSupportsMaxTokens !== undefined
                  ? { supportsMaxTokens: reasoningSupportsMaxTokens }
                  : {}),
              },
            }
          : {}),
        ...(inputModalities?.length ? { inputModalities } : {}),
        ...(outputModalities?.length ? { outputModalities } : {}),
      },
    ];
  });
}

export function parseOpenRouterImageModels(payload: unknown): ReadonlyArray<OpenRouterImageModel> {
  if (!Predicate.isObject(payload) || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap((entry): ReadonlyArray<OpenRouterImageModel> => {
    if (!Predicate.isObject(entry)) return [];
    const id = stringValue(entry.id);
    if (!id) return [];
    const name = stringValue(entry.name);
    const architecture = Predicate.isObject(entry.architecture) ? entry.architecture : undefined;
    const inputModalities = Array.isArray(architecture?.input_modalities)
      ? architecture.input_modalities.filter((value): value is string => typeof value === "string")
      : undefined;
    const outputModalities = Array.isArray(architecture?.output_modalities)
      ? architecture.output_modalities.filter((value): value is string => typeof value === "string")
      : undefined;
    const supportedParameters = parseImageParameterDescriptors(entry.supported_parameters);
    const endpoints = stringValue(entry.endpoints);
    return [
      {
        id,
        ...(name !== undefined ? { name } : {}),
        ...(inputModalities?.length ? { inputModalities } : {}),
        ...(outputModalities?.length ? { outputModalities } : {}),
        imageGeneration: {
          supportedParameters,
          supportsStreaming: entry.supports_streaming === true,
          ...(endpoints !== undefined ? { endpoints } : {}),
        },
      },
    ];
  });
}

function parseImageParameterDescriptor(
  value: unknown,
): OpenRouterImageParameterDescriptor | undefined {
  if (!Predicate.isObject(value)) return undefined;
  if (value.type === "boolean") return { type: "boolean" };
  if (
    value.type === "enum" &&
    Array.isArray(value.values) &&
    value.values.every(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    )
  ) {
    return { type: "enum", values: value.values.map((entry) => entry.trim()) };
  }
  if (
    value.type === "range" &&
    typeof value.min === "number" &&
    typeof value.max === "number" &&
    Number.isFinite(value.min) &&
    Number.isFinite(value.max)
  ) {
    return { type: "range", min: value.min, max: value.max };
  }
  return undefined;
}

function parseImageParameterDescriptors(
  value: unknown,
): Readonly<Record<string, OpenRouterImageParameterDescriptor>> {
  if (!Predicate.isObject(value)) return {};
  const descriptors: Record<string, OpenRouterImageParameterDescriptor> = {};
  for (const [key, descriptor] of Object.entries(value)) {
    const parsed = parseImageParameterDescriptor(descriptor);
    if (parsed) descriptors[key] = parsed;
  }
  return descriptors;
}

function parseOpenRouterImageModelEndpoints(payload: unknown): OpenRouterImageModelEndpoints {
  if (!Predicate.isObject(payload) || !Array.isArray(payload.endpoints)) {
    throw new OpenRouterApiError("OpenRouter returned invalid image model endpoint records.");
  }
  const endpoints = payload.endpoints.flatMap(
    (entry): ReadonlyArray<OpenRouterImageModelEndpoint> => {
      if (!Predicate.isObject(entry)) return [];
      const pricing = Array.isArray(entry.pricing)
        ? entry.pricing.flatMap(
            (line): ReadonlyArray<OpenRouterImageModelEndpoint["pricing"][number]> => {
              if (!Predicate.isObject(line)) return [];
              const billable = stringValue(line.billable);
              const unit = stringValue(line.unit);
              const costUsd = typeof line.cost_usd === "number" ? line.cost_usd : undefined;
              const variant = stringValue(line.variant);
              if (!billable || !unit || costUsd === undefined) return [];
              return [
                {
                  billable,
                  unit,
                  costUsd,
                  ...(variant !== undefined ? { variant } : {}),
                },
              ];
            },
          )
        : [];
      const providerName = stringValue(entry.provider_name);
      const providerSlug = stringValue(entry.provider_slug);
      const providerTag = stringValue(entry.provider_tag);
      return [
        {
          ...(providerName !== undefined ? { providerName } : {}),
          ...(providerSlug !== undefined ? { providerSlug } : {}),
          ...(providerTag !== undefined ? { providerTag } : {}),
          allowedPassthroughParameters: Array.isArray(entry.allowed_passthrough_parameters)
            ? entry.allowed_passthrough_parameters.filter(
                (entry): entry is string => typeof entry === "string",
              )
            : [],
          supportedParameters: parseImageParameterDescriptors(entry.supported_parameters),
          supportsStreaming: entry.supports_streaming === true,
          pricing,
        },
      ];
    },
  );
  const id = stringValue(payload.id);
  if (!id)
    throw new OpenRouterApiError(
      "OpenRouter returned an image model endpoint response without an id.",
    );
  return { id, endpoints };
}

function endpointUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

function errorDetail(status: number): string {
  if (status === 401) return "OpenRouter rejected the API key.";
  if (status === 402) return "OpenRouter account credits are insufficient.";
  if (status === 429) return "OpenRouter rate limit reached.";
  if (status >= 500) return "OpenRouter is temporarily unavailable.";
  return `OpenRouter request failed with HTTP ${status}.`;
}

function parseErrorMessage(payload: unknown): string | undefined {
  if (!Predicate.isObject(payload)) return undefined;

  const topLevelMessage = stringValue(payload.message);
  if (topLevelMessage) return topLevelMessage;

  const error = payload.error;
  if (!Predicate.isObject(error)) return undefined;
  return stringValue(error.message) ?? stringValue(error.detail) ?? stringValue(error.code);
}

function truncateErrorMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length > 512 ? `${normalized.slice(0, 512)}…` : normalized;
}

function parseResponseErrorMessage(rawBody: string): string | undefined {
  if (rawBody.trim().length === 0) return undefined;
  try {
    return parseErrorMessage(JSON.parse(rawBody) as unknown) ?? truncateErrorMessage(rawBody);
  } catch {
    return truncateErrorMessage(rawBody);
  }
}

const openRouterResponseError = Effect.fn("openRouterResponseError")(function* (input: {
  readonly response: HttpClientResponse.HttpClientResponse;
  readonly status: number;
}): Effect.fn.Return<OpenRouterApiError, never> {
  const rawBody = yield* input.response.text.pipe(Effect.orElseSucceed(() => ""));
  const bodyMessage = parseResponseErrorMessage(rawBody);
  const detail = bodyMessage ? ` ${truncateErrorMessage(bodyMessage)}` : "";
  return new OpenRouterApiError(`${errorDetail(input.status)}${detail}`, input.status);
});

const requestJson = Effect.fn("openRouterRequestJson")(function* (input: {
  readonly httpClient: HttpClient.HttpClient;
  readonly request: HttpClientRequest.HttpClientRequest;
}): Effect.fn.Return<unknown, OpenRouterApiError> {
  const response = yield* input.httpClient
    .execute(input.request)
    .pipe(
      Effect.mapError(
        (cause) => new OpenRouterApiError(`OpenRouter request failed: ${String(cause)}`),
      ),
    );
  if (response.status < 200 || response.status >= 300) {
    return yield* Effect.fail(
      yield* openRouterResponseError({ response, status: response.status }),
    );
  }
  return yield* response.json.pipe(
    Effect.mapError(
      (cause) => new OpenRouterApiError(`OpenRouter returned invalid JSON: ${String(cause)}`),
    ),
  );
});

export const createOpenRouterEmbeddings = Effect.fn("createOpenRouterEmbeddings")(function* (
  input: OpenRouterEmbeddingInput,
): Effect.fn.Return<ReadonlyArray<ReadonlyArray<number>>, OpenRouterApiError> {
  const payload = yield* requestJson({
    httpClient: input.httpClient,
    request: HttpClientRequest.post(endpointUrl(input.baseUrl, "embeddings")).pipe(
      HttpClientRequest.bearerToken(input.apiKey),
      HttpClientRequest.bodyJsonUnsafe({
        model: input.model,
        input: input.inputs,
      }),
    ),
  });

  if (!Predicate.isObject(payload) || !Array.isArray(payload.data)) {
    return yield* Effect.fail(new OpenRouterApiError("OpenRouter returned invalid embeddings."));
  }

  const embeddings = payload.data.flatMap((entry): ReadonlyArray<ReadonlyArray<number>> => {
    if (!Predicate.isObject(entry) || !Array.isArray(entry.embedding)) return [];
    const vector = entry.embedding.filter((value): value is number => typeof value === "number");
    return vector.length === entry.embedding.length && vector.length > 0 ? [vector] : [];
  });

  if (embeddings.length !== input.inputs.length) {
    return yield* Effect.fail(
      new OpenRouterApiError("OpenRouter returned an incomplete embeddings response."),
    );
  }

  return embeddings;
});

function parseStreamingImageEvent(line: string): unknown | undefined {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
}

const requestStreamingImage = Effect.fn("openRouterRequestStreamingImage")(function* (input: {
  readonly httpClient: HttpClient.HttpClient;
  readonly request: HttpClientRequest.HttpClientRequest;
}): Effect.fn.Return<unknown, OpenRouterApiError> {
  const response = yield* input.httpClient
    .execute(input.request)
    .pipe(
      Effect.mapError(
        (cause) => new OpenRouterApiError(`OpenRouter request failed: ${String(cause)}`),
      ),
    );
  if (response.status < 200 || response.status >= 300) {
    return yield* Effect.fail(
      yield* openRouterResponseError({ response, status: response.status }),
    );
  }

  const rawBody = yield* response.text.pipe(
    Effect.mapError(
      (cause) => new OpenRouterApiError(`OpenRouter stream failed: ${String(cause)}`),
    ),
  );
  const completedImages: Array<Record<string, unknown>> = [];
  let usage: unknown;
  let created: number | undefined;
  for (const line of rawBody.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:") || trimmed.slice("data:".length).trim() === "[DONE]") continue;
    const event = parseStreamingImageEvent(trimmed.slice("data:".length).trim());
    if (event === undefined) continue;
    if (!Predicate.isObject(event)) continue;
    if (event.type === "error") {
      const error = Predicate.isObject(event.error) ? event.error : undefined;
      return yield* Effect.fail(
        new OpenRouterApiError(
          stringValue(error?.message) ?? "OpenRouter image generation failed.",
        ),
      );
    }
    if (event.type !== "image_generation.completed") continue;
    const b64Json = stringValue(event.b64_json);
    if (!b64Json) continue;
    const mediaType = stringValue(event.media_type);
    completedImages.push({
      b64_json: b64Json,
      ...(mediaType !== undefined ? { media_type: mediaType } : {}),
    });
    if (typeof event.created === "number") created = event.created;
    if (event.usage !== undefined) usage = event.usage;
  }
  if (completedImages.length === 0) {
    return yield* Effect.fail(new OpenRouterApiError("OpenRouter returned no completed images."));
  }
  return {
    data: completedImages,
    ...(created !== undefined ? { created } : {}),
    ...(usage !== undefined ? { usage } : {}),
  };
});

export const fetchOpenRouterModels = Effect.fn("fetchOpenRouterModels")(function* (
  httpClient: HttpClient.HttpClient,
  baseUrl: string,
  apiKey: string,
): Effect.fn.Return<ReadonlyArray<OpenRouterModel>, OpenRouterApiError> {
  const payload = yield* requestJson({
    httpClient,
    request: HttpClientRequest.get(endpointUrl(baseUrl, "models")).pipe(
      HttpClientRequest.bearerToken(apiKey),
    ),
  });
  return parseOpenRouterModels(payload);
});

export const fetchOpenRouterImageModels = Effect.fn("fetchOpenRouterImageModels")(function* (
  httpClient: HttpClient.HttpClient,
  baseUrl: string,
  apiKey: string,
): Effect.fn.Return<ReadonlyArray<OpenRouterImageModel>, OpenRouterApiError> {
  const payload = yield* requestJson({
    httpClient,
    request: HttpClientRequest.get(endpointUrl(baseUrl, "images/models")).pipe(
      HttpClientRequest.bearerToken(apiKey),
    ),
  });
  return parseOpenRouterImageModels(payload);
});

export const fetchOpenRouterImageModelEndpoints = Effect.fn("fetchOpenRouterImageModelEndpoints")(
  function* (
    httpClient: HttpClient.HttpClient,
    baseUrl: string,
    apiKey: string,
    model: string,
  ): Effect.fn.Return<OpenRouterImageModelEndpoints, OpenRouterApiError> {
    const [author, slug] = model.split("/", 2);
    if (!author || !slug)
      return yield* Effect.fail(new OpenRouterApiError("Image model must use author/slug format."));
    const payload = yield* requestJson({
      httpClient,
      request: HttpClientRequest.get(
        endpointUrl(
          baseUrl,
          `images/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`,
        ),
      ).pipe(HttpClientRequest.bearerToken(apiKey)),
    });
    return yield* Effect.try({
      try: () => parseOpenRouterImageModelEndpoints(payload),
      catch: (cause) =>
        cause instanceof OpenRouterApiError ? cause : new OpenRouterApiError(String(cause)),
    });
  },
);

function parseVideoStatus(value: unknown): OpenRouterVideoStatus {
  if (
    value === "pending" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "expired"
  ) {
    return value;
  }
  throw new OpenRouterApiError("OpenRouter returned an invalid video job status.");
}

function parseOpenRouterVideoJob(payload: unknown): OpenRouterVideoJob {
  if (!Predicate.isObject(payload)) {
    throw new OpenRouterApiError("OpenRouter returned an invalid video job.");
  }
  const id = stringValue(payload.id);
  if (!id) throw new OpenRouterApiError("OpenRouter returned a video job without an id.");
  const pollingUrl = stringValue(payload.polling_url);
  const generationId = stringValue(payload.generation_id);
  const error = stringValue(payload.error);
  const unsignedUrls = Array.isArray(payload.unsigned_urls)
    ? payload.unsigned_urls.filter((value): value is string => stringValue(value) !== undefined)
    : undefined;
  return {
    id,
    status: parseVideoStatus(payload.status),
    ...(generationId !== undefined ? { generationId } : {}),
    ...(pollingUrl !== undefined ? { pollingUrl } : {}),
    ...(error !== undefined ? { error } : {}),
    ...(unsignedUrls && unsignedUrls.length > 0 ? { unsignedUrls } : {}),
    ...(payload.usage !== undefined ? { usage: payload.usage } : {}),
  };
}

function parseVideoModelEntry(entry: unknown): OpenRouterVideoModel | undefined {
  if (!Predicate.isObject(entry)) return undefined;
  const id = stringValue(entry.id);
  if (!id) return undefined;
  const canonicalSlug = stringValue(entry.canonical_slug);
  const name = stringValue(entry.name);
  const description = Predicate.isString(entry.description) ? entry.description : undefined;
  const supportedDurations = Array.isArray(entry.supported_durations)
    ? entry.supported_durations.filter(
        (value): value is number => typeof value === "number" && Number.isInteger(value),
      )
    : [];
  const supportedResolutions = Array.isArray(entry.supported_resolutions)
    ? entry.supported_resolutions.filter(
        (value): value is string => stringValue(value) !== undefined,
      )
    : [];
  const supportedAspectRatios = Array.isArray(entry.supported_aspect_ratios)
    ? entry.supported_aspect_ratios.filter(
        (value): value is string => stringValue(value) !== undefined,
      )
    : [];
  const supportedFrameImages = Array.isArray(entry.supported_frame_images)
    ? entry.supported_frame_images.filter(
        (value): value is "first_frame" | "last_frame" =>
          value === "first_frame" || value === "last_frame",
      )
    : [];
  const supportedSizes = Array.isArray(entry.supported_sizes)
    ? entry.supported_sizes.filter((value): value is string => stringValue(value) !== undefined)
    : [];
  const allowedPassthroughParameters = Array.isArray(entry.allowed_passthrough_parameters)
    ? entry.allowed_passthrough_parameters.filter(
        (value): value is string => stringValue(value) !== undefined,
      )
    : [];
  const pricingSkus = Predicate.isObject(entry.pricing_skus) ? entry.pricing_skus : {};
  return {
    id,
    ...(canonicalSlug !== undefined ? { canonicalSlug } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    generateAudio: entry.generate_audio === true,
    supportsSeed: entry.seed === true,
    supportedDurations,
    supportedResolutions,
    supportedAspectRatios,
    supportedFrameImages,
    supportedSizes,
    allowedPassthroughParameters,
    pricingSkus,
  };
}

export function parseOpenRouterVideoModels(payload: unknown): ReadonlyArray<OpenRouterVideoModel> {
  if (!Predicate.isObject(payload) || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap((entry) => {
    const model = parseVideoModelEntry(entry);
    return model ? [model] : [];
  });
}

export const fetchOpenRouterVideoModels = Effect.fn("fetchOpenRouterVideoModels")(function* (
  httpClient: HttpClient.HttpClient,
  baseUrl: string,
  apiKey: string,
): Effect.fn.Return<ReadonlyArray<OpenRouterVideoModel>, OpenRouterApiError> {
  const payload = yield* requestJson({
    httpClient,
    request: HttpClientRequest.get(endpointUrl(baseUrl, "videos/models")).pipe(
      HttpClientRequest.bearerToken(apiKey),
    ),
  });
  return parseOpenRouterVideoModels(payload);
});

const MAX_INLINE_REFERENCE_LENGTH = 16_000_000;

function validateReferenceUrl(
  value: string,
  field: string,
  options: {
    readonly allowHttp?: boolean;
    readonly allowDataUrl?: boolean;
    readonly expectedDataMimePrefix?: string;
  } = {},
): void {
  const trimmed = value.trim();
  if (trimmed.length > MAX_INLINE_REFERENCE_LENGTH) {
    throw new OpenRouterApiError(`${field} is too large to send to OpenRouter.`);
  }
  if (trimmed.startsWith("data:") && options.allowDataUrl !== false) {
    const match = /^data:([^;,]+);base64,([a-z0-9+/=]+)$/i.exec(trimmed);
    const mimeType = match?.[1];
    const base64Payload = match?.[2];
    if (
      !mimeType ||
      !base64Payload ||
      !mimeType.toLowerCase().startsWith(options.expectedDataMimePrefix ?? "")
    ) {
      throw new OpenRouterApiError(`${field} must be a valid base64 image reference.`);
    }
    return;
  }
  try {
    const url = new URL(trimmed);
    const allowedProtocols = options.allowHttp ? ["http:", "https:"] : ["https:"];
    if (!allowedProtocols.includes(url.protocol)) throw new Error();
  } catch {
    throw new OpenRouterApiError(
      `${field} must be a directly downloadable ${options.allowHttp ? "HTTP(S) URL" : "HTTPS URL"} or base64 data URL.`,
    );
  }
}

function validateVideoGenerationInput(input: OpenRouterVideoGenerationInput): void {
  if (input.prompt.trim().length === 0)
    throw new OpenRouterApiError("Video prompt must not be empty.");
  if (input.duration !== undefined && (!Number.isInteger(input.duration) || input.duration < 1)) {
    throw new OpenRouterApiError("Video duration must be an integer of at least one second.");
  }
  if (input.frameImages && input.frameImages.length > 2) {
    throw new OpenRouterApiError(
      "Video generation accepts at most one first frame and one last frame.",
    );
  }
  const frameTypes = new Set<string>();
  for (const frame of input.frameImages ?? []) {
    validateReferenceUrl(frame.image_url.url, "Frame image", {
      expectedDataMimePrefix: "image/",
    });
    if (frameTypes.has(frame.frame_type)) {
      throw new OpenRouterApiError(`Only one ${frame.frame_type} frame may be provided.`);
    }
    frameTypes.add(frame.frame_type);
  }
  for (const reference of input.inputReferences ?? []) {
    const expectedDataMimePrefix =
      reference.type === "image_url"
        ? "image/"
        : reference.type === "audio_url"
          ? "audio/"
          : "video/";
    const url =
      reference.type === "image_url"
        ? reference.image_url.url
        : reference.type === "audio_url"
          ? reference.audio_url.url
          : reference.video_url.url;
    validateReferenceUrl(url, "Video reference", { expectedDataMimePrefix });
  }
  if (input.callbackUrl !== undefined && input.callbackUrl.trim().length > 0) {
    validateReferenceUrl(input.callbackUrl, "Callback URL", { allowDataUrl: false });
  }
  if (input.provider !== undefined) {
    if (!Predicate.isObject(input.provider) || !Predicate.isObject(input.provider.options)) {
      throw new OpenRouterApiError(
        "Video provider options must use the OpenRouter options format.",
      );
    }
    for (const [providerSlug, option] of Object.entries(input.provider.options)) {
      if (providerSlug.trim().length === 0 || !Predicate.isObject(option)) {
        throw new OpenRouterApiError("Video provider options must use non-empty provider slugs.");
      }
      if (!Predicate.isObject(option.parameters)) {
        throw new OpenRouterApiError("Video provider options must include a parameters object.");
      }
    }
  }
}

export const createOpenRouterVideo = Effect.fn("createOpenRouterVideo")(function* (
  input: OpenRouterVideoGenerationInput,
): Effect.fn.Return<OpenRouterVideoJob, OpenRouterApiError> {
  yield* Effect.try({
    try: () => validateVideoGenerationInput(input),
    catch: (cause) =>
      cause instanceof OpenRouterApiError ? cause : new OpenRouterApiError(String(cause)),
  });
  const request = HttpClientRequest.post(endpointUrl(input.baseUrl, "videos")).pipe(
    HttpClientRequest.bearerToken(input.apiKey),
    HttpClientRequest.bodyJsonUnsafe({
      model: input.model,
      prompt: input.prompt.trim(),
      ...(input.duration !== undefined ? { duration: input.duration } : {}),
      ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
      ...(input.aspectRatio !== undefined ? { aspect_ratio: input.aspectRatio } : {}),
      ...(input.size !== undefined ? { size: input.size } : {}),
      ...(input.generateAudio !== undefined ? { generate_audio: input.generateAudio } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(input.frameImages !== undefined ? { frame_images: input.frameImages } : {}),
      ...(input.inputReferences !== undefined ? { input_references: input.inputReferences } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.callbackUrl?.trim() ? { callback_url: input.callbackUrl.trim() } : {}),
    }),
  );
  const payload = yield* requestJson({ httpClient: input.httpClient, request });
  return yield* Effect.try({
    try: () => parseOpenRouterVideoJob(payload),
    catch: (cause) =>
      cause instanceof OpenRouterApiError ? cause : new OpenRouterApiError(String(cause)),
  });
});

export const fetchOpenRouterVideoJob = Effect.fn("fetchOpenRouterVideoJob")(function* (input: {
  readonly httpClient: HttpClient.HttpClient;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly jobId: string;
}): Effect.fn.Return<OpenRouterVideoJob, OpenRouterApiError> {
  const payload = yield* requestJson({
    httpClient: input.httpClient,
    request: HttpClientRequest.get(
      endpointUrl(input.baseUrl, `videos/${encodeURIComponent(input.jobId)}`),
    ).pipe(HttpClientRequest.bearerToken(input.apiKey)),
  });
  return yield* Effect.try({
    try: () => parseOpenRouterVideoJob(payload),
    catch: (cause) =>
      cause instanceof OpenRouterApiError ? cause : new OpenRouterApiError(String(cause)),
  });
});

export const downloadOpenRouterVideo = Effect.fn("downloadOpenRouterVideo")(function* (input: {
  readonly httpClient: HttpClient.HttpClient;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly jobId: string;
  readonly index?: number;
}): Effect.fn.Return<OpenRouterVideoDownload, OpenRouterApiError> {
  const index = input.index ?? 0;
  const response = yield* input.httpClient
    .execute(
      HttpClientRequest.get(
        endpointUrl(
          input.baseUrl,
          `videos/${encodeURIComponent(input.jobId)}/content?index=${index}`,
        ),
      ).pipe(HttpClientRequest.bearerToken(input.apiKey)),
    )
    .pipe(
      Effect.mapError(
        (cause) => new OpenRouterApiError(`OpenRouter video download failed: ${String(cause)}`),
      ),
    );
  if (response.status < 200 || response.status >= 300) {
    return yield* Effect.fail(
      yield* openRouterResponseError({ response, status: response.status }),
    );
  }
  const bytes = yield* response.arrayBuffer.pipe(
    Effect.mapError(
      (cause) => new OpenRouterApiError(`OpenRouter video download failed: ${String(cause)}`),
    ),
  );
  return {
    bytes: new Uint8Array(bytes),
    mediaType: response.headers["content-type"]?.split(";", 1)[0] ?? "video/mp4",
  };
});

function validateImageGenerationInput(input: OpenRouterImageGenerationInput): void {
  if (input.prompt.trim().length === 0)
    throw new OpenRouterApiError("Image prompt must not be empty.");
  if (input.n !== undefined && (!Number.isInteger(input.n) || input.n < 1 || input.n > 10)) {
    throw new OpenRouterApiError("OpenRouter image generation supports between 1 and 10 images.");
  }
  if (
    input.outputCompression !== undefined &&
    (!Number.isInteger(input.outputCompression) ||
      input.outputCompression < 0 ||
      input.outputCompression > 100)
  ) {
    throw new OpenRouterApiError("Image output compression must be an integer from 0 to 100.");
  }
  for (const reference of input.inputReferences ?? []) {
    validateReferenceUrl(reference.image_url.url, "Image reference", {
      allowHttp: true,
      expectedDataMimePrefix: "image/",
    });
  }
}

function parseOpenRouterImageGenerationResult(payload: unknown): OpenRouterImageGenerationResult {
  if (!Predicate.isObject(payload) || !Array.isArray(payload.data)) {
    throw new OpenRouterApiError("OpenRouter returned an invalid image-generation response.");
  }
  const data = payload.data.flatMap((entry): ReadonlyArray<OpenRouterGeneratedImage> => {
    if (!Predicate.isObject(entry)) return [];
    const b64Json = stringValue(entry.b64_json);
    if (!b64Json) return [];
    const mediaType = stringValue(entry.media_type);
    const revisedPrompt = stringValue(entry.revised_prompt);
    return [
      {
        b64Json,
        ...(mediaType !== undefined ? { mediaType } : {}),
        ...(revisedPrompt !== undefined ? { revisedPrompt } : {}),
      },
    ];
  });
  if (data.length === 0) throw new OpenRouterApiError("OpenRouter returned no generated images.");
  const model = stringValue(payload.model);
  return {
    data,
    ...(typeof payload.created === "number" ? { created: payload.created } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(payload.usage !== undefined ? { usage: payload.usage } : {}),
  };
}

export interface OpenRouterImageCapabilities {
  readonly supportedParameters: Readonly<Record<string, OpenRouterImageParameterDescriptor>>;
  readonly supportsStreaming: boolean;
}

function intersectImageParameterDescriptors(
  descriptors: ReadonlyArray<OpenRouterImageParameterDescriptor>,
): OpenRouterImageParameterDescriptor | undefined {
  const first = descriptors[0];
  if (first === undefined) return undefined;
  if (descriptors.some((descriptor) => descriptor.type !== first.type)) return undefined;

  if (first.type === "boolean") return { type: "boolean" };

  if (first.type === "range") {
    let min = -Infinity;
    let max = Infinity;
    for (const descriptor of descriptors) {
      if (descriptor.type !== "range") return undefined;
      min = Math.max(min, descriptor.min);
      max = Math.min(max, descriptor.max);
    }
    return min <= max ? { type: "range", min, max } : undefined;
  }

  const sharedValues = first.values.filter((value) =>
    descriptors.every(
      (descriptor) => descriptor.type === "enum" && descriptor.values.includes(value),
    ),
  );
  return sharedValues.length > 0 ? { type: "enum", values: sharedValues } : undefined;
}

/**
 * Merges per-endpoint capability records into the set that is safe to send
 * with automatic provider routing. A request field is only kept when every
 * endpoint accepts it, and enum values are intersected so the request works
 * no matter which endpoint OpenRouter picks.
 */
export function mergeOpenRouterImageCapabilities(
  endpoints: ReadonlyArray<OpenRouterImageModelEndpoint>,
): OpenRouterImageCapabilities {
  if (endpoints.length === 0) return { supportedParameters: {}, supportsStreaming: false };

  const parameterNames = new Set<string>();
  for (const endpoint of endpoints) {
    for (const name of Object.keys(endpoint.supportedParameters)) parameterNames.add(name);
  }

  const supportedParameters: Record<string, OpenRouterImageParameterDescriptor> = {};
  for (const name of parameterNames) {
    const descriptors = endpoints
      .map((endpoint) => endpoint.supportedParameters[name])
      .filter(
        (descriptor): descriptor is OpenRouterImageParameterDescriptor => descriptor !== undefined,
      );
    if (descriptors.length !== endpoints.length) continue;
    const merged = intersectImageParameterDescriptors(descriptors);
    if (merged) supportedParameters[name] = merged;
  }

  return {
    supportedParameters,
    supportsStreaming: endpoints.every((endpoint) => endpoint.supportsStreaming),
  };
}

/**
 * Resolves the effective capabilities for a generation request. When the
 * request pins a provider with `provider.only`, that endpoint's records are
 * authoritative; otherwise the request may route to any endpoint, so the
 * endpoint records are merged into a safe intersection.
 */
export function resolveOpenRouterImageCapabilities(
  result: OpenRouterImageModelEndpoints,
  provider: Readonly<Record<string, unknown>> | undefined,
): OpenRouterImageCapabilities {
  const only = provider?.only;
  if (Array.isArray(only) && only.length > 0) {
    const pinned =
      result.endpoints.find(
        (endpoint) => endpoint.providerSlug !== undefined && only.includes(endpoint.providerSlug),
      ) ??
      result.endpoints.find(
        (endpoint) => endpoint.providerTag !== undefined && only.includes(endpoint.providerTag),
      );
    if (pinned) {
      return {
        supportedParameters: pinned.supportedParameters,
        supportsStreaming: pinned.supportsStreaming,
      };
    }
  }
  return mergeOpenRouterImageCapabilities(result.endpoints);
}

function imageParameterBounds(
  descriptor: OpenRouterImageParameterDescriptor,
  defaultMin: number,
  defaultMax: number,
): { readonly min: number; readonly max: number } {
  return descriptor.type === "range"
    ? { min: descriptor.min, max: descriptor.max }
    : { min: defaultMin, max: defaultMax };
}

function clampImageNumber(
  value: number,
  bounds: { readonly min: number; readonly max: number },
): number {
  return Math.min(bounds.max, Math.max(bounds.min, Math.floor(value)));
}

function sanitizeImageEnumValue<const T extends string>(
  value: T | undefined,
  descriptor: OpenRouterImageParameterDescriptor | undefined,
): T | undefined {
  if (value === undefined) return undefined;
  if (descriptor === undefined) return undefined;
  if (descriptor.type !== "enum") return value;
  if (descriptor.values.includes(value)) return value;
  return descriptor.values[0] as T;
}

function sanitizeImageRangeValue(
  value: number | undefined,
  descriptor: OpenRouterImageParameterDescriptor | undefined,
  defaultMin: number,
  defaultMax: number,
): number | undefined {
  if (value === undefined || descriptor === undefined) return undefined;
  return clampImageNumber(value, imageParameterBounds(descriptor, defaultMin, defaultMax));
}

function sanitizeImageReferences(
  references: ReadonlyArray<OpenRouterImageReference> | undefined,
  descriptor: OpenRouterImageParameterDescriptor | undefined,
): ReadonlyArray<OpenRouterImageReference> | undefined {
  if (references === undefined || descriptor === undefined) return undefined;
  const bounds = imageParameterBounds(descriptor, 0, Number.MAX_SAFE_INTEGER);
  if (references.length < bounds.min) {
    throw new OpenRouterApiError(
      `This model requires at least ${bounds.min} reference image${bounds.min === 1 ? "" : "s"}.`,
    );
  }
  if (references.length > bounds.max) {
    throw new OpenRouterApiError(
      `This model accepts at most ${bounds.max} reference image${bounds.max === 1 ? "" : "s"}.`,
    );
  }
  return references;
}

/**
 * Shapes a generation request so it only carries fields the model's endpoints
 * accept. Unsupported fields are dropped, numbers are clamped into the model's
 * ranges, and enum values are remapped to a value the model accepts so the
 * provider default still applies when the requested value is unavailable.
 * Violating a hard reference-image requirement fails with a clear error.
 */
export function sanitizeOpenRouterImageInput(
  input: OpenRouterImageGenerationInput,
  capabilities: OpenRouterImageCapabilities,
): OpenRouterImageGenerationInput {
  const supported = capabilities.supportedParameters;
  const resolution = sanitizeImageEnumValue(input.resolution, supported.resolution);
  const aspectRatio = sanitizeImageEnumValue(input.aspectRatio, supported.aspect_ratio);
  const size = sanitizeImageEnumValue(input.size, supported.size);
  const quality = sanitizeImageEnumValue(input.quality, supported.quality);
  const outputFormat = sanitizeImageEnumValue(input.outputFormat, supported.output_format);
  const background = sanitizeImageEnumValue(input.background, supported.background);
  const n = sanitizeImageRangeValue(input.n, supported.n, 1, 10);
  const outputCompression = sanitizeImageRangeValue(
    input.outputCompression,
    supported.output_compression,
    0,
    100,
  );
  const seed = sanitizeImageRangeValue(input.seed, supported.seed, 0, Number.MAX_SAFE_INTEGER);
  const inputReferences = sanitizeImageReferences(
    input.inputReferences,
    supported.input_references,
  );

  return {
    httpClient: input.httpClient,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    prompt: input.prompt,
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.stream === true && capabilities.supportsStreaming ? { stream: true } : {}),
    ...(n !== undefined ? { n } : {}),
    // An explicit pixel size is authoritative; a mismatched resolution
    // alongside it is rejected with a 400, so drop resolution when both exist.
    ...(resolution !== undefined && size === undefined ? { resolution } : {}),
    ...(aspectRatio !== undefined ? { aspectRatio } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(quality !== undefined ? { quality } : {}),
    ...(outputFormat !== undefined ? { outputFormat } : {}),
    ...(background !== undefined ? { background } : {}),
    ...(outputCompression !== undefined ? { outputCompression } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(inputReferences !== undefined ? { inputReferences } : {}),
  };
}

export const generateOpenRouterImage = Effect.fn("generateOpenRouterImage")(function* (
  input: OpenRouterImageGenerationInput,
): Effect.fn.Return<OpenRouterImageGenerationResult, OpenRouterApiError> {
  yield* Effect.try({
    try: () => validateImageGenerationInput(input),
    catch: (cause) =>
      cause instanceof OpenRouterApiError ? cause : new OpenRouterApiError(String(cause)),
  });
  let request = HttpClientRequest.post(endpointUrl(input.baseUrl, "images")).pipe(
    HttpClientRequest.bearerToken(input.apiKey),
    HttpClientRequest.setHeader("Content-Type", "application/json"),
  );
  if (input.stream) {
    request = request.pipe(HttpClientRequest.setHeader("Accept", "text/event-stream"));
  }
  request = request.pipe(
    HttpClientRequest.bodyJsonUnsafe({
      model: input.model,
      prompt: input.prompt,
      ...(input.stream !== undefined ? { stream: input.stream } : {}),
      ...(input.n !== undefined ? { n: input.n } : {}),
      ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
      ...(input.aspectRatio !== undefined ? { aspect_ratio: input.aspectRatio } : {}),
      ...(input.size !== undefined ? { size: input.size } : {}),
      ...(input.quality !== undefined ? { quality: input.quality } : {}),
      ...(input.outputFormat !== undefined ? { output_format: input.outputFormat } : {}),
      ...(input.background !== undefined ? { background: input.background } : {}),
      ...(input.outputCompression !== undefined
        ? { output_compression: input.outputCompression }
        : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(input.inputReferences !== undefined ? { input_references: input.inputReferences } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
    }),
  );
  const payload = yield* (input.stream ? requestStreamingImage : requestJson)({
    httpClient: input.httpClient,
    request,
  });
  return yield* Effect.try({
    try: () => parseOpenRouterImageGenerationResult(payload),
    catch: (cause) =>
      cause instanceof OpenRouterApiError ? cause : new OpenRouterApiError(String(cause)),
  });
});

function parseOpenRouterCompletionSseLine(line: string): OpenRouterCompletionChunk | undefined {
  const trimmedLine = line.trim();
  if (!trimmedLine.startsWith("data:")) return undefined;

  const data = trimmedLine.slice("data:".length).trim();
  if (data === "[DONE]") {
    return { delta: "", done: true };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }

  if (!Predicate.isObject(payload)) return undefined;
  const firstChoice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  const delta =
    Predicate.isObject(firstChoice) && Predicate.isObject(firstChoice.delta)
      ? firstChoice.delta
      : undefined;
  const content = delta && Predicate.isString(delta.content) ? delta.content : "";
  const reasoningDelta =
    delta && Predicate.isString(delta.reasoning)
      ? delta.reasoning
      : delta && Predicate.isString(delta.reasoning_content)
        ? delta.reasoning_content
        : undefined;
  const reasoningDetails =
    delta && Array.isArray(delta.reasoning_details) ? delta.reasoning_details : undefined;
  const toolCallDeltas =
    delta && Array.isArray(delta.tool_calls)
      ? delta.tool_calls.flatMap((toolCall, index): ReadonlyArray<OpenRouterToolCallDelta> => {
          if (!Predicate.isObject(toolCall)) return [];
          const functionValue = Predicate.isObject(toolCall.function)
            ? toolCall.function
            : undefined;
          if (!functionValue) return [];
          const callIndex = typeof toolCall.index === "number" ? toolCall.index : index;
          const id = stringValue(toolCall.id);
          const name = functionValue ? stringValue(functionValue.name) : undefined;
          const argumentsDelta =
            functionValue && Predicate.isString(functionValue.arguments)
              ? functionValue.arguments
              : undefined;
          return [
            {
              index: callIndex,
              ...(id !== undefined ? { id } : {}),
              ...(name !== undefined ? { name } : {}),
              ...(argumentsDelta !== undefined ? { argumentsDelta } : {}),
            },
          ];
        })
      : undefined;
  const model = stringValue(payload.model);
  const annotationsValue =
    (delta && delta.annotations) ??
    (Predicate.isObject(firstChoice) ? firstChoice.annotations : undefined) ??
    payload.annotations;
  const annotations = Array.isArray(annotationsValue) ? annotationsValue : undefined;

  return {
    delta: content,
    done: false,
    ...(reasoningDelta !== undefined ? { reasoningDelta } : {}),
    ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(payload.usage !== undefined ? { usage: payload.usage } : {}),
    ...(annotations !== undefined ? { annotations } : {}),
    ...(toolCallDeltas !== undefined && toolCallDeltas.length > 0 ? { toolCallDeltas } : {}),
  };
}

export const streamOpenRouterCompletion = Effect.fn("streamOpenRouterCompletion")(
  function* (input: {
    readonly httpClient: HttpClient.HttpClient;
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly model: string;
    readonly messages: ReadonlyArray<OpenRouterCompletionMessage>;
    readonly tools?: ReadonlyArray<OpenRouterToolDefinition>;
    readonly modelCapabilities?: Pick<OpenRouterModel, "supportedParameters" | "reasoning">;
    readonly modelOptions?: ReadonlyArray<OpenRouterModelOptionSelection>;
  }): Effect.fn.Return<
    Stream.Stream<OpenRouterCompletionChunk, OpenRouterApiError>,
    OpenRouterApiError
  > {
    const localTools = input.modelCapabilities?.supportedParameters?.includes("tools")
      ? (input.tools ?? [])
      : [];
    const supportedParameters = input.modelCapabilities?.supportedParameters;
    const selectedReasoningEffort = input.modelOptions?.find(
      (option) =>
        (option.id === "reasoningEffort" ||
          option.id === "reasoning_effort" ||
          option.id === "reasoning" ||
          option.id === "effort") &&
        typeof option.value === "string",
    )?.value;
    const supportedReasoningEfforts = input.modelCapabilities?.reasoning?.supportedEfforts;
    const isSupportedReasoningEffort = (value: string) =>
      supportedReasoningEfforts === undefined || supportedReasoningEfforts.includes(value);
    const selectedEffortIsValid =
      typeof selectedReasoningEffort === "string" &&
      (selectedReasoningEffort === "none"
        ? input.modelCapabilities?.reasoning?.mandatory !== true
        : isSupportedReasoningEffort(selectedReasoningEffort));
    const reasoningEffort = selectedEffortIsValid
      ? selectedReasoningEffort
      : input.modelCapabilities?.reasoning?.mandatory
        ? [
            input.modelCapabilities.reasoning.defaultEffort,
            ...(supportedReasoningEfforts ?? []),
          ].find(
            (value): value is string =>
              value !== undefined && value !== "none" && isSupportedReasoningEffort(value),
          )
        : undefined;
    const reasoningRequest =
      reasoningEffort !== undefined && supportedParameters?.includes("reasoning_effort")
        ? { reasoning_effort: reasoningEffort }
        : reasoningEffort !== undefined && supportedParameters?.includes("reasoning")
          ? { reasoning: { effort: reasoningEffort } }
          : {};
    // Provider compatibility checks include request parameters. These optional
    // tool controls are not advertised by BaseTen's GLM endpoint, so sending
    // them unconditionally can make require_parameters reject the route.
    // BaseTen is the intended OpenRouter endpoint for GLM 5.3 Flash. The base
    // provider slug intentionally allows OpenRouter to match its endpoint
    // variants while retaining OpenRouter's normal provider fallbacks.
    const provider = {
      ...(input.model === OPENROUTER_GLM_5_3_FLASH_MODEL
        ? { order: [OPENROUTER_BASETEN_PROVIDER] }
        : {}),
      ...(localTools.length > 0 ? { require_parameters: true } : {}),
    };
    const response = yield* input.httpClient
      .execute(
        HttpClientRequest.post(endpointUrl(input.baseUrl, "chat/completions")).pipe(
          HttpClientRequest.bearerToken(input.apiKey),
          HttpClientRequest.setHeader("Content-Type", "application/json"),
          HttpClientRequest.setHeader("Accept", "text/event-stream"),
          HttpClientRequest.bodyJsonUnsafe({
            model: input.model,
            messages: input.messages,
            stream: true,
            stream_options: { include_usage: true },
            store: false,
            // OpenRouter selects native search or its managed fallback for the model.
            tools: [
              { type: "openrouter:web_search" },
              { type: "openrouter:web_fetch" },
              ...localTools,
            ],
            ...(input.modelCapabilities?.supportedParameters?.includes("tool_choice")
              ? { tool_choice: "auto" }
              : {}),
            ...reasoningRequest,
            ...(Object.keys(provider).length > 0 ? { provider } : {}),
          }),
        ),
      )
      .pipe(
        Effect.mapError(
          (cause) => new OpenRouterApiError(`OpenRouter request failed: ${String(cause)}`),
        ),
      );

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        yield* openRouterResponseError({ response, status: response.status }),
      );
    }

    return response.stream.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.map(parseOpenRouterCompletionSseLine),
      Stream.filter((chunk): chunk is OpenRouterCompletionChunk => chunk !== undefined),
      Stream.mapError(
        (cause) => new OpenRouterApiError(`OpenRouter stream failed: ${String(cause)}`),
      ),
    );
  },
);
