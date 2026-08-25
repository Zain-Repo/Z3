import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

export interface OpenRouterModel {
  readonly id: string;
  readonly name?: string;
  readonly contextLength?: number;
}

export interface OpenRouterCompletionMessage {
  readonly role: "user" | "assistant" | "system" | "tool";
  readonly content: string | null;
  readonly tool_calls?: ReadonlyArray<OpenRouterToolCall>;
  readonly tool_call_id?: string;
  readonly name?: string;
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

export interface OpenRouterCompletionChunk {
  readonly delta: string;
  readonly done: boolean;
  readonly model?: string;
  readonly usage?: unknown;
  readonly annotations?: ReadonlyArray<unknown>;
  readonly toolCallDeltas?: ReadonlyArray<OpenRouterToolCallDelta>;
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
    return [
      {
        id,
        ...(name !== undefined ? { name } : {}),
        ...(contextLength !== undefined ? { contextLength } : {}),
      },
    ];
  });
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
      new OpenRouterApiError(errorDetail(response.status), response.status),
    );
  }
  return yield* response.json.pipe(
    Effect.mapError(
      (cause) => new OpenRouterApiError(`OpenRouter returned invalid JSON: ${String(cause)}`),
    ),
  );
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
  }): Effect.fn.Return<
    Stream.Stream<OpenRouterCompletionChunk, OpenRouterApiError>,
    OpenRouterApiError
  > {
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
            tools: [{ type: "openrouter:web_search" }, ...(input.tools ?? [])],
            tool_choice: "auto",
            parallel_tool_calls: true,
            max_tool_calls: 5,
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
        new OpenRouterApiError(errorDetail(response.status), response.status),
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
