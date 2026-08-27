// @effect-diagnostics preferSchemaOverJson:off
import {
  EventId,
  ProviderDriverKind,
  RuntimeItemId,
  RuntimeRequestId,
  ThreadId,
  TurnId,
  ApprovalRequestId,
  type ProviderApprovalDecision,
  type ProviderOptionSelection,
  type ProviderRuntimeEvent,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ProviderTurnStartResult,
  type ProviderUserInputAnswers,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import {
  fetchOpenRouterModels,
  streamOpenRouterCompletion,
  type OpenRouterCompletionChunk,
  type OpenRouterCompletionMessage,
  type OpenRouterMessageContentPart,
  type OpenRouterModel,
  type OpenRouterToolCall,
  type OpenRouterToolDefinition,
  normalizeOpenRouterImageMimeType,
} from "./OpenRouterApi.ts";
import {
  type ProviderAdapterError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionClosedError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
} from "../Errors.ts";
import type {
  ProviderAdapterCapabilities,
  ProviderAdapterShape,
  ProviderThreadSnapshot,
  ProviderThreadTurnSnapshot,
} from "../Services/ProviderAdapter.ts";

type CompatibleCompletionMessage = OpenRouterCompletionMessage;

type CompatibleCompletionChunk = {
  readonly delta: string;
  readonly done: boolean;
  readonly reasoningDelta?: string;
  readonly reasoningDetails?: ReadonlyArray<unknown>;
  readonly model?: string;
  readonly usage?: unknown;
  readonly annotations?: ReadonlyArray<unknown>;
  readonly toolCallDeltas?: OpenRouterCompletionChunk["toolCallDeltas"];
};

export interface OpenRouterToolSupport {
  readonly definitions: ReadonlyArray<OpenRouterToolDefinition>;
  readonly approvalKind: (name: string) => "none" | "command" | "file-change";
  readonly execute: (input: {
    readonly name: string;
    readonly arguments: unknown;
    readonly cwd: string | undefined;
    readonly runtimeMode: ProviderSession["runtimeMode"];
  }) => Effect.Effect<string>;
}

export const OPENROUTER_WORKSPACE_TOOL_DEFINITIONS: ReadonlyArray<OpenRouterToolDefinition> = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file relative to the current workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Workspace-relative file path." } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write complete UTF-8 file contents relative to the current workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative file path." },
          contents: { type: "string", description: "The complete new file contents." },
        },
        required: ["path", "contents"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "Search workspace paths to discover files and directories.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional path search text." },
          kind: { type: "string", enum: ["file", "directory"] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search text content in workspace files.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Text to search for." } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_patch",
      description: "Apply a strict single-file unified diff to a workspace file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative file path." },
          patch: { type: "string", description: "Single-file unified diff." },
        },
        required: ["path", "patch"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run an executable with structured arguments in the workspace.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Executable name or path." },
          args: { type: "array", items: { type: "string" } },
          timeoutSeconds: { type: "number", minimum: 1, maximum: 120 },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
];

export interface OpenAICompatibleAdapterConfig {
  readonly httpClient: HttpClient.HttpClient;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly defaultModel: string;
  readonly instanceId: string;
  readonly provider: ProviderDriverKind;
  readonly providerLabel: string;
  readonly idPrefix: string;
  readonly attachmentsDisabledReason?: string;
  readonly attachmentModelUnsupportedReason?: (model: string) => string | undefined;
  readonly attachmentMimeTypeNormalizer?: (mimeType: string) => string | undefined;
  readonly fileSystem?: FileSystem.FileSystem;
  readonly attachmentsDir?: string;
  /** Some OpenAI-compatible APIs support tools without advertising metadata. */
  readonly supportsTools?: boolean;
  /** DeepSeek calls this assistant message field `reasoning_content`. */
  readonly reasoningMessageField?: "reasoning" | "reasoning_content";
  readonly toolSupport?: OpenRouterToolSupport;
  readonly getModelCapabilities?: (
    model: string,
  ) => Effect.Effect<
    Pick<OpenRouterModel, "supportedParameters" | "inputModalities" | "reasoning"> | undefined,
    Error
  >;
  readonly streamCompletion: (input: {
    readonly httpClient: HttpClient.HttpClient;
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly model: string;
    readonly messages: ReadonlyArray<CompatibleCompletionMessage>;
    readonly tools?: ReadonlyArray<OpenRouterToolDefinition>;
    readonly modelCapabilities?: Pick<OpenRouterModel, "supportedParameters" | "reasoning">;
    readonly modelOptions?: ReadonlyArray<ProviderOptionSelection>;
  }) => Effect.Effect<Stream.Stream<CompatibleCompletionChunk, Error>, Error>;
}

interface CompatibleSessionState {
  session: ProviderSession;
  messages: Array<CompatibleCompletionMessage>;
  readonly pendingApprovals: Map<ApprovalRequestId, PendingApproval>;
  readonly sessionAcceptedTools: Set<string>;
}

interface PendingApproval {
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>;
  readonly threadId: ThreadId;
  readonly turnId: TurnId;
  readonly requestType: "file_change_approval" | "command_execution_approval";
  readonly toolName: string;
}

const capabilities: ProviderAdapterCapabilities = { sessionModelSwitch: "in-session" };

function errorDetail(error: unknown, providerLabel: string): string {
  return error instanceof Error ? error.message : `${providerLabel} request failed.`;
}

function toolError(error: unknown): string {
  return JSON.stringify({ error: error instanceof Error ? error.message : error });
}

function parseToolArguments(raw: string): { readonly value?: unknown; readonly error?: string } {
  try {
    return { value: JSON.parse(raw) as unknown };
  } catch {
    return { error: "The model returned malformed JSON tool arguments." };
  }
}

const buildOpenAICompatibleUserContent = Effect.fn("buildOpenAICompatibleUserContent")(function* (
  input: ProviderSendTurnInput,
  dependencies: {
    readonly fileSystem: FileSystem.FileSystem;
    readonly attachmentsDir: string;
    readonly provider: ProviderDriverKind;
    readonly providerLabel: string;
    readonly normalizeMimeType: (mimeType: string) => string | undefined;
  },
) {
  const content: Array<OpenRouterMessageContentPart> = [];
  if (input.input) {
    content.push({ type: "text", text: input.input });
  }

  for (const attachment of input.attachments ?? []) {
    if (attachment.type !== "image") {
      return yield* new ProviderAdapterValidationError({
        provider: dependencies.provider,
        operation: "sendTurn",
        issue: "The direct OpenRouter driver supports image attachments only.",
      });
    }

    const attachmentPath = resolveAttachmentPath({
      attachmentsDir: dependencies.attachmentsDir,
      attachment,
    });
    if (!attachmentPath) {
      return yield* new ProviderAdapterRequestError({
        provider: dependencies.provider,
        method: "sendTurn",
        detail: `Invalid attachment id '${attachment.id}'.`,
      });
    }

    const mimeType = dependencies.normalizeMimeType(attachment.mimeType);
    if (!mimeType) {
      return yield* new ProviderAdapterValidationError({
        provider: dependencies.provider,
        operation: "sendTurn",
        issue:
          `${dependencies.providerLabel} accepts PNG, JPEG, WEBP, and GIF image attachments only. Convert the image and try again.`,
      });
    }

    const bytes = yield* dependencies.fileSystem.readFile(attachmentPath).pipe(
      Effect.mapError(
        (cause) =>
          new ProviderAdapterRequestError({
            provider: dependencies.provider,
            method: "sendTurn",
            detail: "Failed to read attachment file.",
            cause,
          }),
      ),
    );
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
      },
    });
  }

  return content;
});

export const makeOpenAICompatibleAdapter = (config: OpenAICompatibleAdapterConfig) =>
  Effect.gen(function* () {
    const PROVIDER = config.provider;
    const events = yield* Effect.acquireRelease(
      PubSub.unbounded<ProviderRuntimeEvent>(),
      PubSub.shutdown,
    );
    const adapterScope = yield* Effect.scope;
    const sessions = new Map<string, CompatibleSessionState>();
    const turnFibers = new Map<string, Fiber.Fiber<void, never>>();
    const modelCapabilitiesCache = new Map<
      string,
      Pick<OpenRouterModel, "supportedParameters" | "inputModalities" | "reasoning"> | null
    >();
    let sequence = 0;

    const stamp = (createdAt: string) => ({
      eventId: EventId.make(`${config.idPrefix}-${sequence++}`),
      createdAt,
    });
    const publish = (event: ProviderRuntimeEvent) =>
      PubSub.publish(events, event).pipe(Effect.asVoid);
    const sessionFor = (threadId: string) => {
      const state = sessions.get(threadId);
      return state;
    };
    const missingSession = (threadId: string) =>
      new ProviderAdapterSessionNotFoundError({ provider: config.provider, threadId });

    const resolveModelCapabilities = (model: string) =>
      Effect.gen(function* () {
        if (modelCapabilitiesCache.has(model)) {
          return modelCapabilitiesCache.get(model) ?? undefined;
        }
        if (!config.getModelCapabilities) return undefined;
        const resolved = yield* config
          .getModelCapabilities(model)
          .pipe(Effect.orElseSucceed(() => undefined));
        modelCapabilitiesCache.set(model, resolved ?? null);
        return resolved;
      });

    const publishRequestResolved = (
      state: CompatibleSessionState,
      requestId: ApprovalRequestId,
      pending: PendingApproval,
      decision: ProviderApprovalDecision,
    ) =>
      Effect.gen(function* () {
        const now = DateTime.formatIso(yield* DateTime.now);
        yield* publish({
          type: "request.resolved",
          ...stamp(now),
          provider: PROVIDER,
          threadId: state.session.threadId,
          turnId: pending.turnId,
          requestId: RuntimeRequestId.make(String(requestId)),
          payload: {
            requestType: pending.requestType,
            decision,
            resolution: { tool: pending.toolName },
          },
        });
      });

    const cancelPendingApprovals = (state: CompatibleSessionState) =>
      Effect.forEach(
        [...state.pendingApprovals.entries()],
        ([requestId, pending]) =>
          Effect.gen(function* () {
            yield* Deferred.succeed(pending.decision, "cancel").pipe(Effect.ignore);
            state.pendingApprovals.delete(requestId);
            yield* publishRequestResolved(state, requestId, pending, "cancel");
          }),
        { discard: true },
      );

    const requestApproval = (
      state: CompatibleSessionState,
      turnId: TurnId,
      toolName: string,
      kind: "command" | "file-change",
      argumentsValue: unknown,
    ) =>
      Effect.gen(function* () {
        const requestId = ApprovalRequestId.make(`${config.idPrefix}-approval-${sequence++}`);
        const requestType =
          kind === "command" ? "command_execution_approval" : "file_change_approval";
        const decision = yield* Deferred.make<ProviderApprovalDecision>();
        const pending: PendingApproval = {
          decision,
          threadId: state.session.threadId,
          turnId,
          requestType,
          toolName,
        };
        state.pendingApprovals.set(requestId, pending);
        const now = DateTime.formatIso(yield* DateTime.now);
        yield* publish({
          type: "request.opened",
          ...stamp(now),
          provider: PROVIDER,
          threadId: state.session.threadId,
          turnId,
          requestId: RuntimeRequestId.make(String(requestId)),
          payload: {
            requestType,
            supportedDecisions: ["accept", "acceptForSession", "decline", "cancel"],
            detail: `${config.providerLabel} requests permission to run ${toolName}.`,
            args: argumentsValue,
          },
        });
        const resolved = yield* Deferred.await(decision);
        state.pendingApprovals.delete(requestId);
        return resolved;
      });

    const completeTurn: (
      state: CompatibleSessionState,
      turnId: TurnId,
      turnInput: ProviderSendTurnInput,
      toolRound?: number,
    ) => Effect.Effect<void, never> = (
      state: CompatibleSessionState,
      turnId: TurnId,
      turnInput: ProviderSendTurnInput,
      toolRound = 0,
    ) =>
      Effect.gen(function* () {
        if (toolRound > 8) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "chat/completions",
            detail: `${config.providerLabel} exceeded the workspace tool-call limit for this turn.`,
          });
        }
        const model = turnInput.modelSelection?.model ?? state.session.model ?? config.defaultModel;
        const modelCapabilities = yield* resolveModelCapabilities(model);
        const localTools =
          config.toolSupport &&
          (config.supportsTools === true || modelCapabilities?.supportedParameters?.includes("tools"))
            ? config.toolSupport.definitions
            : undefined;
        let content = "";
        let reasoning = "";
        let reasoningDetails: ReadonlyArray<unknown> | undefined;
        let resolvedModel: string | undefined;
        let usage: unknown;
        let annotations: ReadonlyArray<unknown> | undefined;
        const toolCallParts = new Map<
          number,
          { id: string | undefined; name: string | undefined; arguments: string }
        >();
        const itemId = RuntimeItemId.make(`${config.idPrefix}-item-${turnId}`);
        yield* config
          .streamCompletion({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model,
            messages: state.messages,
            httpClient: config.httpClient,
            ...(localTools ? { tools: localTools } : {}),
            ...(modelCapabilities ? { modelCapabilities } : {}),
            ...(turnInput.modelSelection?.options
              ? { modelOptions: turnInput.modelSelection.options }
              : {}),
          })
          .pipe(
            Effect.flatMap((stream) =>
              stream.pipe(
                Stream.runForEach((chunk) =>
                  Effect.gen(function* () {
                    if (chunk.reasoningDelta && chunk.reasoningDelta.length > 0) {
                      reasoning += chunk.reasoningDelta;
                      const createdAt = DateTime.formatIso(yield* DateTime.now);
                      yield* publish({
                        type: "content.delta",
                        ...stamp(createdAt),
                        provider: PROVIDER,
                        threadId: state.session.threadId,
                        turnId,
                        itemId,
                        payload: { streamKind: "reasoning_text", delta: chunk.reasoningDelta },
                      });
                    }
                    if (chunk.reasoningDetails !== undefined) reasoningDetails = chunk.reasoningDetails;
                    content += chunk.delta;
                    resolvedModel ??= chunk.model;
                    if (chunk.usage !== undefined) usage = chunk.usage;
                    if (chunk.annotations !== undefined) annotations = chunk.annotations;
                    for (const toolCallDelta of chunk.toolCallDeltas ?? []) {
                      const current = toolCallParts.get(toolCallDelta.index) ?? {
                        id: undefined,
                        name: undefined,
                        arguments: "",
                      };
                      current.id ??= toolCallDelta.id;
                      current.name ??= toolCallDelta.name;
                      current.arguments += toolCallDelta.argumentsDelta ?? "";
                      toolCallParts.set(toolCallDelta.index, current);
                    }
                    if (chunk.delta.length === 0) return;
                    const createdAt = DateTime.formatIso(yield* DateTime.now);
                    yield* publish({
                      type: "content.delta",
                      ...stamp(createdAt),
                      provider: PROVIDER,
                      threadId: state.session.threadId,
                      turnId,
                      itemId,
                      payload: { streamKind: "assistant_text", delta: chunk.delta },
                    });
                  }),
                ),
              ),
            ),
            Effect.mapError(
              (cause) =>
                new ProviderAdapterRequestError({
                  provider: PROVIDER,
                  method: "chat/completions",
                  detail: errorDetail(cause, config.providerLabel),
                  cause,
                }),
            ),
          );
        if (toolCallParts.size > 0) {
          const toolCalls: Array<OpenRouterToolCall> = [];
          for (const [index, part] of [...toolCallParts.entries()].sort(
            ([left], [right]) => left - right,
          )) {
            if (!part.name) continue;
            toolCalls.push({
              id: part.id ?? `${config.idPrefix}-tool-call-${turnId}-${index}`,
              type: "function",
              function: { name: part.name, arguments: part.arguments },
            });
          }
          if (toolCalls.length === 0) {
            return yield* new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "chat/completions",
              detail: `${config.providerLabel} returned an incomplete tool call.`,
            });
          }
          state.messages.push({
            role: "assistant",
            content: content || null,
            tool_calls: toolCalls,
            ...(reasoning
              ? {
                  [config.reasoningMessageField ?? "reasoning"]: reasoning,
                }
              : {}),
            ...(reasoningDetails ? { reasoning_details: reasoningDetails } : {}),
          });
          const assistantCompletedAt = DateTime.formatIso(yield* DateTime.now);
          yield* publish({
            type: "item.completed",
            ...stamp(assistantCompletedAt),
            provider: PROVIDER,
            threadId: state.session.threadId,
            turnId,
            itemId,
            payload: {
              itemType: "assistant_message",
              status: "completed",
              data: { content, ...(reasoning ? { reasoning } : {}) },
            },
          });
          for (const toolCall of toolCalls) {
            const toolItemId = RuntimeItemId.make(`${config.idPrefix}-${toolCall.id}`);
            const toolStartedAt = DateTime.formatIso(yield* DateTime.now);
            yield* publish({
              type: "item.started",
              ...stamp(toolStartedAt),
              provider: PROVIDER,
              threadId: state.session.threadId,
              turnId,
              itemId: toolItemId,
              payload: {
                itemType: "dynamic_tool_call",
                status: "inProgress",
                data: { name: toolCall.function.name, arguments: toolCall.function.arguments },
              },
            });
            const parsedArguments = parseToolArguments(toolCall.function.arguments);
            const toolArguments = parsedArguments.value;
            const argumentError = parsedArguments.error;
            let result = argumentError ? toolError(argumentError) : toolError("Workspace tools are unavailable.");
            if (!argumentError && config.toolSupport && localTools) {
              const kind = config.toolSupport.approvalKind(toolCall.function.name);
              const requiresApproval =
                kind !== "none" &&
                !state.sessionAcceptedTools.has(toolCall.function.name) &&
                state.session.runtimeMode !== "full-access" &&
                !(state.session.runtimeMode === "auto-accept-edits" && kind === "file-change");
              let decision: ProviderApprovalDecision | undefined;
              if (requiresApproval) decision = yield* requestApproval(state, turnId, toolCall.function.name, kind, toolArguments);
              if (!decision || decision === "accept" || decision === "acceptForSession") {
                if (decision === "acceptForSession") state.sessionAcceptedTools.add(toolCall.function.name);
                result = yield* config.toolSupport.execute({
                  name: toolCall.function.name,
                  arguments: toolArguments,
                  cwd: state.session.cwd,
                  runtimeMode: state.session.runtimeMode,
                });
              } else {
                result = toolError({
                  error: `Tool '${toolCall.function.name}' was ${decision === "cancel" ? "cancelled" : "declined"}.`,
                  decision,
                });
              }
            }
            state.messages.push({
              role: "tool",
              content: result,
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
            });
            const toolCompletedAt = DateTime.formatIso(yield* DateTime.now);
            yield* publish({
              type: "item.completed",
              ...stamp(toolCompletedAt),
              provider: PROVIDER,
              threadId: state.session.threadId,
              turnId,
              itemId: toolItemId,
              payload: {
                itemType: "dynamic_tool_call",
                status: "completed",
                data: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                  result,
                },
              },
            });
          }
          return yield* Effect.suspend(() => completeTurn(state, turnId, turnInput, toolRound + 1));
        }
        if (content.trim().length === 0) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "chat/completions",
            detail: `${config.providerLabel} returned no assistant content.`,
          });
        }
        state.messages.push({
          role: "assistant",
          content,
          ...(reasoning
            ? {
                [config.reasoningMessageField ?? "reasoning"]: reasoning,
              }
            : {}),
          ...(reasoningDetails ? { reasoning_details: reasoningDetails } : {}),
        });
        const completedAt = DateTime.formatIso(yield* DateTime.now);
        yield* publish({
          type: "item.completed",
          ...stamp(completedAt),
          provider: PROVIDER,
          threadId: state.session.threadId,
          turnId,
          itemId,
          payload: {
            itemType: "assistant_message",
            status: "completed",
            data: { content, ...(annotations !== undefined ? { annotations } : {}) },
          },
        });
        const { activeTurnId: _activeTurnId, ...sessionWithoutActiveTurn } = state.session;
        state.session = {
          ...sessionWithoutActiveTurn,
          status: "ready",
          model: resolvedModel ?? model,
          updatedAt: completedAt,
        };
        sessions.set(state.session.threadId, state);
        yield* publish({
          type: "turn.completed",
          ...stamp(completedAt),
          provider: PROVIDER,
          threadId: state.session.threadId,
          turnId,
          payload: { state: "completed", stopReason: "stop", usage },
        });
        yield* publish({
          type: "session.state.changed",
          ...stamp(completedAt),
          provider: PROVIDER,
          threadId: state.session.threadId,
          payload: { state: "ready", reason: `${config.providerLabel} turn completed` },
        });
      }).pipe(
        Effect.catch((error: ProviderAdapterRequestError) =>
          Effect.gen(function* () {
            const now = DateTime.formatIso(yield* DateTime.now);
            const { activeTurnId: _activeTurnId, ...sessionWithoutActiveTurn } = state.session;
            state.session = { ...sessionWithoutActiveTurn, status: "ready", updatedAt: now };
            sessions.set(state.session.threadId, state);
            yield* publish({
              type: "runtime.error",
              ...stamp(now),
              provider: PROVIDER,
              threadId: state.session.threadId,
              turnId,
              payload: {
                message: errorDetail(error, config.providerLabel),
                class: "provider_error",
              },
            });
            yield* publish({
              type: "turn.completed",
              ...stamp(now),
              provider: PROVIDER,
              threadId: state.session.threadId,
              turnId,
              payload: {
                state: "failed",
                errorMessage: errorDetail(error, config.providerLabel),
              },
            });
            yield* publish({
              type: "session.state.changed",
              ...stamp(now),
              provider: PROVIDER,
              threadId: state.session.threadId,
              payload: { state: "ready", reason: `${config.providerLabel} turn failed` },
            });
          }),
        ),
        Effect.ensuring(Effect.sync(() => turnFibers.delete(String(turnId)))),
      );

    const adapter: ProviderAdapterShape<ProviderAdapterError> = {
      provider: PROVIDER,
      capabilities,
      startSession: (input) =>
        Effect.gen(function* () {
          const existing = sessionFor(input.threadId);
          if (existing) return existing.session;
          const now = DateTime.formatIso(yield* DateTime.now);
          const model = input.modelSelection?.model ?? config.defaultModel;
          const session: ProviderSession = {
            provider: PROVIDER,
            providerInstanceId: input.providerInstanceId,
            status: "ready",
            runtimeMode: input.runtimeMode,
            ...(input.cwd ? { cwd: input.cwd } : {}),
            model,
            threadId: input.threadId,
            createdAt: now,
            updatedAt: now,
          };
          sessions.set(input.threadId, {
            session,
            messages: [],
            pendingApprovals: new Map(),
            sessionAcceptedTools: new Set(),
          });
          yield* publish({
            type: "session.started",
            ...stamp(now),
            provider: PROVIDER,
            providerInstanceId: input.providerInstanceId,
            threadId: input.threadId,
            payload: {},
          });
          yield* publish({
            type: "session.state.changed",
            ...stamp(now),
            provider: PROVIDER,
            providerInstanceId: input.providerInstanceId,
            threadId: input.threadId,
            payload: { state: "ready", reason: `${config.providerLabel} session ready` },
          });
          yield* publish({
            type: "thread.started",
            ...stamp(now),
            provider: PROVIDER,
            providerInstanceId: input.providerInstanceId,
            threadId: input.threadId,
            payload: { providerThreadId: input.threadId },
          });
          return session;
        }),
      sendTurn: (input) =>
        Effect.gen(function* () {
          const state = sessionFor(input.threadId);
          if (!state) return yield* missingSession(input.threadId);
          if (state.session.status === "closed")
            return yield* new ProviderAdapterSessionClosedError({
              provider: PROVIDER,
              threadId: input.threadId,
            });
          if (!input.input || input.input.trim().length === 0)
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "sendTurn",
              issue: `${config.providerLabel} requires text input.`,
            });
          const model = input.modelSelection?.model ?? state.session.model ?? config.defaultModel;
          const modelCapabilities =
            (input.attachments?.length ?? 0) > 0
              ? yield* resolveModelCapabilities(model)
              : undefined;
          if ((input.attachments?.length ?? 0) > 0 && config.attachmentsDisabledReason) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "sendTurn",
              issue: config.attachmentsDisabledReason,
            });
          }
          if (
            (input.attachments?.length ?? 0) > 0 &&
            (config.fileSystem === undefined || config.attachmentsDir === undefined)
          ) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "sendTurn",
              issue: `${config.providerLabel} does not support attachments.`,
            });
          }
          if (
            (input.attachments ?? []).some((attachment) => attachment.type === "image") &&
            modelCapabilities?.inputModalities !== undefined &&
            !modelCapabilities.inputModalities.some((modality) => modality.toLowerCase() === "image")
          ) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "sendTurn",
              issue:
                config.attachmentModelUnsupportedReason?.(model) ??
                `${config.providerLabel} model '${model}' does not accept image input.`,
            });
          }
          const userContent =
            (input.attachments?.length ?? 0) > 0
              ? yield* buildOpenAICompatibleUserContent(input, {
                  fileSystem: config.fileSystem!,
                  attachmentsDir: config.attachmentsDir!,
                  provider: PROVIDER,
                  providerLabel: config.providerLabel,
                  normalizeMimeType:
                    config.attachmentMimeTypeNormalizer ?? normalizeOpenRouterImageMimeType,
                })
              : input.input;
          const now = DateTime.formatIso(yield* DateTime.now);
          const turnId = TurnId.make(`${config.idPrefix}-turn-${sequence++}`);
          state.messages.push({ role: "user", content: userContent });
          state.session = {
            ...state.session,
            status: "running",
            activeTurnId: turnId,
            model,
            updatedAt: now,
          };
          sessions.set(input.threadId, state);
          yield* publish({
            type: "turn.started",
            ...stamp(now),
            provider: PROVIDER,
            threadId: input.threadId,
            turnId,
            payload: { model },
          });
          const itemId = RuntimeItemId.make(`${config.idPrefix}-item-${turnId}`);
          yield* publish({
            type: "item.started",
            ...stamp(now),
            provider: PROVIDER,
            threadId: input.threadId,
            turnId,
            itemId,
            payload: { itemType: "assistant_message", status: "inProgress" },
          });
          const fiber = yield* completeTurn(state, turnId, input).pipe(
            Effect.forkIn(adapterScope, { startImmediately: true }),
          );
          turnFibers.set(String(turnId), fiber);
          return { threadId: input.threadId, turnId } satisfies ProviderTurnStartResult;
        }),
      interruptTurn: (threadId, turnId) =>
        Effect.gen(function* () {
          const state = sessionFor(threadId);
          if (!state) return yield* missingSession(threadId);
          const activeTurnId = turnId ?? state.session.activeTurnId;
          if (activeTurnId) {
            yield* cancelPendingApprovals(state);
            const fiber = turnFibers.get(String(activeTurnId));
            if (fiber) {
              yield* Fiber.interrupt(fiber);
              turnFibers.delete(String(activeTurnId));
            }
            const { activeTurnId: _activeTurnId, ...sessionWithoutActiveTurn } = state.session;
            state.session = {
              ...sessionWithoutActiveTurn,
              status: "ready",
              updatedAt: DateTime.formatIso(yield* DateTime.now),
            };
            sessions.set(threadId, state);
            yield* publish({
              type: "turn.aborted",
              ...stamp(state.session.updatedAt),
              provider: PROVIDER,
              threadId,
              turnId: activeTurnId,
              payload: { reason: "Interrupted by user" },
            });
          }
        }),
      respondToRequest: (threadId, requestId, decision) =>
        Effect.gen(function* () {
          const state = sessionFor(threadId);
          if (!state) return yield* missingSession(threadId);
          const pending = state.pendingApprovals.get(requestId);
          if (!pending) {
            return yield* new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "respondToRequest",
              detail: `Unknown pending approval request: ${requestId}`,
            });
          }
          if (decision === "acceptForSession") state.sessionAcceptedTools.add(pending.toolName);
          yield* Deferred.succeed(pending.decision, decision).pipe(Effect.ignore);
          state.pendingApprovals.delete(requestId);
          yield* publishRequestResolved(state, requestId, pending, decision);
        }),
      respondToUserInput: (
        _threadId: ThreadId,
        _requestId: ApprovalRequestId,
        _answers: ProviderUserInputAnswers,
      ) =>
        Effect.fail(
          new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "respondToUserInput",
            detail: `${config.providerLabel} does not expose user-input requests.`,
          }),
        ),
      stopSession: (threadId) =>
        Effect.gen(function* () {
          const state = sessionFor(threadId);
          if (!state) return yield* missingSession(threadId);
          const activeTurnId = state.session.activeTurnId;
          if (activeTurnId) {
            yield* cancelPendingApprovals(state);
            const fiber = turnFibers.get(String(activeTurnId));
            if (fiber) yield* Fiber.interrupt(fiber);
          }
          const { activeTurnId: _activeTurnId, ...sessionWithoutActiveTurn } = state.session;
          state.session = {
            ...sessionWithoutActiveTurn,
            status: "closed",
            updatedAt: DateTime.formatIso(yield* DateTime.now),
          };
          sessions.set(threadId, state);
          yield* publish({
            type: "session.exited",
            ...stamp(DateTime.formatIso(yield* DateTime.now)),
            provider: PROVIDER,
            threadId,
            payload: { reason: "Stopped by user", recoverable: true, exitKind: "graceful" },
          });
        }),
      listSessions: () => Effect.succeed([...sessions.values()].map((state) => state.session)),
      hasSession: (threadId) => Effect.succeed(sessions.has(threadId)),
      readThread: (threadId) => {
        const state = sessionFor(threadId);
        if (!state) return Effect.fail(missingSession(threadId));
        const turns: Array<ProviderThreadTurnSnapshot> = [];
        for (let index = 0; index < state.messages.length; index += 2) {
          turns.push({
            id: TurnId.make(`${config.idPrefix}-history-${index}`),
            items: state.messages.slice(index, index + 2),
          });
        }
        return Effect.succeed({
          threadId: ThreadId.make(threadId),
          turns,
        } satisfies ProviderThreadSnapshot);
      },
      rollbackThread: (threadId, numTurns) => {
        const state = sessionFor(threadId);
        if (!state) return Effect.fail(missingSession(threadId));
        state.messages.splice(Math.max(0, state.messages.length - Math.max(0, numTurns) * 2));
        return adapter.readThread(ThreadId.make(threadId));
      },
      stopAll: () =>
        Effect.forEach(
          [...sessions.keys()],
          (threadId) => adapter.stopSession(ThreadId.make(threadId)),
          { discard: true },
        ),
      streamEvents: Stream.fromPubSub(events),
    };
    return adapter;
  });

export const makeOpenRouterAdapter = (config: {
  readonly httpClient: HttpClient.HttpClient;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly defaultModel: string;
  readonly instanceId: string;
  readonly fileSystem: FileSystem.FileSystem;
  readonly attachmentsDir: string;
  readonly toolSupport: OpenRouterToolSupport;
}) =>
  makeOpenAICompatibleAdapter({
    ...config,
    provider: ProviderDriverKind.make("openrouter"),
    providerLabel: "OpenRouter",
    idPrefix: "openrouter",
    toolSupport: config.toolSupport,
    getModelCapabilities: (model) =>
      fetchOpenRouterModels(config.httpClient, config.baseUrl, config.apiKey).pipe(
        Effect.map((models) => models.find((candidate) => candidate.id === model)),
      ),
    streamCompletion: (input) => streamOpenRouterCompletion(input),
  });
