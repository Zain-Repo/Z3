import {
  EventId,
  ProviderDriverKind,
  RuntimeItemId,
  ThreadId,
  TurnId,
  type ApprovalRequestId,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ProviderTurnStartResult,
  type ProviderUserInputAnswers,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Fiber from "effect/Fiber";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { streamOpenRouterCompletion } from "./OpenRouterApi.ts";
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

type CompatibleCompletionMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

type CompatibleCompletionChunk = {
  readonly delta: string;
  readonly done: boolean;
  readonly reasoningDelta?: string;
  readonly model?: string;
  readonly usage?: unknown;
  readonly annotations?: ReadonlyArray<unknown>;
};

export interface OpenAICompatibleAdapterConfig {
  readonly httpClient: HttpClient.HttpClient;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly defaultModel: string;
  readonly instanceId: string;
  readonly provider: ProviderDriverKind;
  readonly providerLabel: string;
  readonly idPrefix: string;
  readonly streamCompletion: (input: {
    readonly httpClient: HttpClient.HttpClient;
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly model: string;
    readonly messages: ReadonlyArray<CompatibleCompletionMessage>;
  }) => Effect.Effect<Stream.Stream<CompatibleCompletionChunk, Error>, Error>;
}

interface CompatibleSessionState {
  session: ProviderSession;
  messages: Array<CompatibleCompletionMessage>;
}

const capabilities: ProviderAdapterCapabilities = { sessionModelSwitch: "in-session" };

function errorDetail(error: unknown, providerLabel: string): string {
  return error instanceof Error ? error.message : `${providerLabel} request failed.`;
}

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

    const completeTurn = (
      state: CompatibleSessionState,
      turnId: TurnId,
      turnInput: ProviderSendTurnInput,
    ) =>
      Effect.gen(function* () {
        const model = turnInput.modelSelection?.model ?? state.session.model ?? config.defaultModel;
        let content = "";
        let resolvedModel: string | undefined;
        let usage: unknown;
        let annotations: ReadonlyArray<unknown> | undefined;
        const itemId = RuntimeItemId.make(`${config.idPrefix}-item-${turnId}`);
        yield* config.streamCompletion({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model,
          messages: state.messages,
          httpClient: config.httpClient,
        }).pipe(
          Effect.flatMap((stream) =>
            stream.pipe(
              Stream.runForEach((chunk) =>
                Effect.gen(function* () {
                  if (chunk.reasoningDelta && chunk.reasoningDelta.length > 0) {
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
                  content += chunk.delta;
                  resolvedModel ??= chunk.model;
                  if (chunk.usage !== undefined) usage = chunk.usage;
                  if (chunk.annotations !== undefined) annotations = chunk.annotations;
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
        if (content.trim().length === 0) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "chat/completions",
            detail: `${config.providerLabel} returned no assistant content.`,
          });
        }
        state.messages.push({ role: "assistant", content });
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
          sessions.set(input.threadId, { session, messages: [] });
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
          if ((input.attachments?.length ?? 0) > 0)
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "sendTurn",
              issue: `The direct ${config.providerLabel} driver currently accepts text turns only.`,
            });
          const now = DateTime.formatIso(yield* DateTime.now);
          const turnId = TurnId.make(`${config.idPrefix}-turn-${sequence++}`);
          state.messages.push({ role: "user", content: input.input });
          const model = input.modelSelection?.model ?? state.session.model ?? config.defaultModel;
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
      respondToRequest: (
        _threadId: ThreadId,
        _requestId: ApprovalRequestId,
        _decision: ProviderApprovalDecision,
      ) =>
        Effect.fail(
          new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "respondToRequest",
            detail: `${config.providerLabel} does not expose approval requests.`,
          }),
        ),
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
}) =>
  makeOpenAICompatibleAdapter({
    ...config,
    provider: ProviderDriverKind.make("openrouter"),
    providerLabel: "OpenRouter",
    idPrefix: "openrouter",
    streamCompletion: (input) => streamOpenRouterCompletion(input),
  });
