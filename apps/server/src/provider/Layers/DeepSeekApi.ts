import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import type {
  OpenRouterMessageContentPart,
  OpenRouterToolCallDelta,
  OpenRouterToolDefinition,
} from "./OpenRouterApi.ts";

export interface DeepSeekModel {
  readonly id: string;
  readonly name?: string;
}

export interface DeepSeekCompletionMessage {
  readonly role: "user" | "assistant" | "system" | "tool";
  readonly content: string | ReadonlyArray<OpenRouterMessageContentPart> | null;
  readonly tool_calls?: ReadonlyArray<{
    readonly id: string;
    readonly type: "function";
    readonly function: { readonly name: string; readonly arguments: string };
  }>;
  readonly tool_call_id?: string;
  readonly name?: string;
  readonly reasoning_content?: string | null;
}

export interface DeepSeekCompletionChunk {
  readonly delta: string;
  readonly done: boolean;
  readonly reasoningDelta?: string;
  readonly toolCallDeltas?: ReadonlyArray<OpenRouterToolCallDelta>;
  readonly model?: string;
  readonly usage?: unknown;
}

export class DeepSeekApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "DeepSeekApiError";
    this.status = status;
  }
}

const stringValue = (value: unknown): string | undefined =>
  Predicate.isString(value) && value.trim().length > 0 ? value.trim() : undefined;

export function parseDeepSeekModels(payload: unknown): ReadonlyArray<DeepSeekModel> {
  if (!Predicate.isObject(payload) || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap((entry): ReadonlyArray<DeepSeekModel> => {
    if (!Predicate.isObject(entry)) return [];
    const id = stringValue(entry.id);
    if (!id) return [];
    const name = stringValue(entry.name);
    return [{ id, ...(name !== undefined ? { name } : {}) }];
  });
}

function endpointUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

function errorDetail(status: number): string {
  if (status === 401) return "DeepSeek rejected the API key.";
  if (status === 402) return "DeepSeek account balance is insufficient.";
  if (status === 429) return "DeepSeek rate limit reached.";
  if (status >= 500) return "DeepSeek is temporarily unavailable.";
  return `DeepSeek request failed with HTTP ${status}.`;
}

const requestJson = Effect.fn("deepSeekRequestJson")(function* (input: {
  readonly httpClient: HttpClient.HttpClient;
  readonly request: HttpClientRequest.HttpClientRequest;
}): Effect.fn.Return<unknown, DeepSeekApiError> {
  const response = yield* input.httpClient
    .execute(input.request)
    .pipe(
      Effect.mapError((cause) => new DeepSeekApiError(`DeepSeek request failed: ${String(cause)}`)),
    );
  if (response.status < 200 || response.status >= 300) {
    return yield* Effect.fail(new DeepSeekApiError(errorDetail(response.status), response.status));
  }
  return yield* response.json.pipe(
    Effect.mapError(
      (cause) => new DeepSeekApiError(`DeepSeek returned invalid JSON: ${String(cause)}`),
    ),
  );
});

export const fetchDeepSeekModels = Effect.fn("fetchDeepSeekModels")(function* (
  httpClient: HttpClient.HttpClient,
  baseUrl: string,
  apiKey: string,
): Effect.fn.Return<ReadonlyArray<DeepSeekModel>, DeepSeekApiError> {
  const payload = yield* requestJson({
    httpClient,
    request: HttpClientRequest.get(endpointUrl(baseUrl, "models")).pipe(
      HttpClientRequest.bearerToken(apiKey),
    ),
  });
  return parseDeepSeekModels(payload);
});

function parseDeepSeekCompletionSseLine(line: string): DeepSeekCompletionChunk | undefined {
  const trimmedLine = line.trim();
  if (!trimmedLine.startsWith("data:")) return undefined;

  const data = trimmedLine.slice("data:".length).trim();
  if (data === "[DONE]") return { delta: "", done: true };

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
  const reasoningContent =
    delta && Predicate.isString(delta.reasoning_content) ? delta.reasoning_content : undefined;
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
          const name = stringValue(functionValue.name);
          const argumentsDelta = Predicate.isString(functionValue.arguments)
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

  return {
    delta: content,
    done: false,
    ...(reasoningContent !== undefined && reasoningContent.length > 0
      ? { reasoningDelta: reasoningContent }
      : {}),
    ...(toolCallDeltas !== undefined && toolCallDeltas.length > 0 ? { toolCallDeltas } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(payload.usage !== undefined ? { usage: payload.usage } : {}),
  };
}

export const streamDeepSeekCompletion = Effect.fn("streamDeepSeekCompletion")(function* (input: {
  readonly httpClient: HttpClient.HttpClient;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly messages: ReadonlyArray<DeepSeekCompletionMessage>;
  readonly tools?: ReadonlyArray<OpenRouterToolDefinition>;
}): Effect.fn.Return<Stream.Stream<DeepSeekCompletionChunk, DeepSeekApiError>, DeepSeekApiError> {
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
          ...(input.tools && input.tools.length > 0
            ? { tools: input.tools, tool_choice: "auto" }
            : {}),
        }),
      ),
    )
    .pipe(
      Effect.mapError((cause) => new DeepSeekApiError(`DeepSeek request failed: ${String(cause)}`)),
    );

  if (response.status < 200 || response.status >= 300) {
    return yield* Effect.fail(new DeepSeekApiError(errorDetail(response.status), response.status));
  }

  return response.stream.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.map(parseDeepSeekCompletionSseLine),
    Stream.filter((chunk): chunk is DeepSeekCompletionChunk => chunk !== undefined),
    Stream.mapError((cause) => new DeepSeekApiError(`DeepSeek stream failed: ${String(cause)}`)),
  );
});
