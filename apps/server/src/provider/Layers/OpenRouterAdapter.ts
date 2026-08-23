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

import { streamOpenRouterCompletion, type OpenRouterCompletionMessage } from "./OpenRouterApi.ts";
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

const PROVIDER = ProviderDriverKind.make("openrouter");

interface OpenRouterSessionState {
  session: ProviderSession;
  messages: Array<OpenRouterCompletionMessage>;
}

const capabilities: ProviderAdapterCapabilities = { sessionModelSwitch: "in-session" };

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : "OpenRouter request failed.";
}

export const makeOpenRouterAdapter = (config: {
  readonly httpClient: HttpClient.HttpClient;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly defaultModel: string;
  readonly instanceId: string;
}) =>
  Effect.gen(function* () {
    const events = yield* Effect.acquireRelease(
      PubSub.unbounded<ProviderRuntimeEvent>(),
      PubSub.shutdown,
    );
    const adapterScope = yield* Effect.scope;
    const sessions = new Map<string, OpenRouterSessionState>();
    const turnFibers = new Map<string, Fiber.Fiber<void, never>>();
    let sequence = 0;

    const stamp = (createdAt: string) => ({
      eventId: EventId.make(`openrouter-${sequence++}`),
      createdAt,
    });
    const publish = (event: ProviderRuntimeEvent) =>
      PubSub.publish(events, event).pipe(Effect.asVoid);
    const sessionFor = (threadId: string) => {
      const state = sessions.get(threadId);
      return state;
    };
    const missingSession = (threadId: string) =>
      new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId });

    const completeTurn = (
      state: OpenRouterSessionState,
      turnId: TurnId,
      turnInput: ProviderSendTurnInput,
    ) =>
      Effect.gen(function* () {
        const model = turnInput.modelSelection?.model ?? state.session.model ?? config.defaultModel;
        let content = "";
        let resolvedModel: string | undefined;
        let usage: unknown;
        const itemId = RuntimeItemId.make(`openrouter-item-${turnId}`);
        yield* streamOpenRouterCompletion({
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
                  content += chunk.delta;
                  resolvedModel ??= chunk.model;
                  if (chunk.usage !== undefined) usage = chunk.usage;
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
                detail: errorDetail(cause),
                cause,
              }),
          ),
        );
        if (content.trim().length === 0) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "chat/completions",
            detail: "OpenRouter returned no assistant content.",
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
          payload: { itemType: "assistant_message", status: "completed", data: { content } },
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
          payload: { state: "ready", reason: "OpenRouter turn completed" },
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
              payload: { message: errorDetail(error), class: "provider_error" },
            });
            yield* publish({
              type: "turn.completed",
              ...stamp(now),
              provider: PROVIDER,
              threadId: state.session.threadId,
              turnId,
              payload: { state: "failed", errorMessage: errorDetail(error) },
            });
            yield* publish({
              type: "session.state.changed",
              ...stamp(now),
              provider: PROVIDER,
              threadId: state.session.threadId,
              payload: { state: "ready", reason: "OpenRouter turn failed" },
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
            payload: { state: "ready", reason: "OpenRouter session ready" },
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
              issue: "OpenRouter requires text input.",
            });
          if ((input.attachments?.length ?? 0) > 0)
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "sendTurn",
              issue: "The direct OpenRouter driver currently accepts text turns only.",
            });
          const now = DateTime.formatIso(yield* DateTime.now);
          const turnId = TurnId.make(`openrouter-turn-${sequence++}`);
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
          const itemId = RuntimeItemId.make(`openrouter-item-${turnId}`);
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
            detail: "OpenRouter does not expose approval requests.",
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
            detail: "OpenRouter does not expose user-input requests.",
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
            id: TurnId.make(`openrouter-history-${index}`),
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
