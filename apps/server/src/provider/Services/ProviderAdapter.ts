/**
 * ProviderAdapter - Provider-specific runtime adapter contract.
 *
 * Defines the provider-native session/protocol operations that `ProviderService`
 * routes to after resolving the target provider. Implementations should focus
 * on provider behavior only and avoid cross-provider orchestration concerns.
 *
 * @module ProviderAdapter
 */
import type {
  ApprovalRequestId,
  ProviderApprovalDecision,
  ProviderDriverKind,
  ProviderUserInputAnswers,
  ProviderRuntimeEvent,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ThreadId,
  ProviderTurnStartResult,
  TurnId,
} from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import * as EffectRuntime from "effect/Effect";
import * as Semaphore from "effect/Semaphore";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { ProviderAdapterSessionNotFoundError } from "../Errors.ts";

export type ProviderSessionModelSwitchMode = "in-session" | "unsupported";

export interface ProviderAdapterCapabilities {
  /**
   * Declares whether changing the model on an existing session is supported.
   */
  readonly sessionModelSwitch: ProviderSessionModelSwitchMode;
}

export interface ProviderThreadTurnSnapshot {
  readonly id: TurnId;
  readonly items: ReadonlyArray<unknown>;
}

export interface ProviderThreadSnapshot {
  readonly threadId: ThreadId;
  readonly turns: ReadonlyArray<ProviderThreadTurnSnapshot>;
  readonly resumeCursor?: unknown;
}

export interface ProviderAdapterSession extends ProviderSession {
  readonly sessionLease?: import("@t3tools/contracts").ProviderSessionLease;
}

export interface ProviderThreadRollbackTarget {
  readonly turnIds: ReadonlyArray<TurnId>;
  readonly anchorTurnId?: TurnId;
}

export function rollbackTargetMatchesTurnPrefix(
  turns: ReadonlyArray<Pick<ProviderThreadTurnSnapshot, "id">>,
  target: ProviderThreadRollbackTarget,
): boolean {
  return target.turnIds.every((turnId, index) => turns[index]?.id === turnId);
}

export function rollbackTargetMatchesKnownHistory(
  turns: ReadonlyArray<Pick<ProviderThreadTurnSnapshot, "id">>,
  target: ProviderThreadRollbackTarget,
): boolean {
  return rollbackTargetMatchesTurnPrefix(turns, target);
}

export const makeRequireActiveProviderSession =
  <Session extends { readonly stopped: boolean }>(
    sessions: ReadonlyMap<ThreadId, Session>,
    provider: ProviderDriverKind,
  ) =>
  (threadId: ThreadId): EffectRuntime.Effect<Session, ProviderAdapterSessionNotFoundError> => {
    const session = sessions.get(threadId);
    return session === undefined || session.stopped
      ? EffectRuntime.fail(new ProviderAdapterSessionNotFoundError({ provider, threadId }))
      : EffectRuntime.succeed(session);
  };

export function makeKeyedLock<Key>(options?: { readonly retain?: (key: Key) => boolean }) {
  return EffectRuntime.gen(function* () {
    const entries = yield* SynchronizedRef.make(
      new Map<Key, { readonly semaphore: Semaphore.Semaphore; readonly references: number }>(),
    );
    return {
      withLock: <A, E, R>(key: Key, effect: EffectRuntime.Effect<A, E, R>) =>
        SynchronizedRef.modifyEffect(entries, (current) => {
          const existing = current.get(key);
          if (existing) {
            const next = new Map(current);
            next.set(key, { ...existing, references: existing.references + 1 });
            return EffectRuntime.succeed([existing.semaphore, next] as const);
          }
          return Semaphore.make(1).pipe(
            EffectRuntime.map((semaphore) => {
              const next = new Map(current);
              next.set(key, { semaphore, references: 1 });
              return [semaphore, next] as const;
            }),
          );
        }).pipe(
          EffectRuntime.flatMap((semaphore) =>
            semaphore.withPermit(effect).pipe(
              EffectRuntime.ensuring(
                SynchronizedRef.update(entries, (current) => {
                  const entry = current.get(key);
                  if (!entry) return current;
                  const next = new Map(current);
                  if (entry.references <= 1 && !options?.retain?.(key)) next.delete(key);
                  else next.set(key, { ...entry, references: entry.references - 1 });
                  return next;
                }),
              ),
            ),
          ),
        ),
      inspect: (key: Key) =>
        SynchronizedRef.get(entries).pipe(
          EffectRuntime.map((current) => ({
            keyCount: current.size,
            references: current.get(key)?.references ?? 0,
          })),
        ),
    };
  });
}

export interface ProviderAdapterShape<TError> {
  /**
   * Provider kind implemented by this adapter.
   */
  readonly provider: ProviderDriverKind;
  readonly capabilities: ProviderAdapterCapabilities;

  /**
   * Start a provider-backed session.
   */
  readonly startSession: (
    input: ProviderSessionStartInput,
  ) => Effect.Effect<ProviderAdapterSession, TError>;

  /**
   * Send a turn to an active provider session.
   */
  readonly sendTurn: (
    input: ProviderSendTurnInput,
  ) => Effect.Effect<ProviderTurnStartResult, TError>;

  /**
   * Interrupt an active turn.
   */
  readonly interruptTurn: (threadId: ThreadId, turnId?: TurnId) => Effect.Effect<void, TError>;

  /**
   * Respond to an interactive approval request.
   */
  readonly respondToRequest: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Effect.Effect<void, TError>;

  /**
   * Respond to a structured user-input request.
   */
  readonly respondToUserInput: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ) => Effect.Effect<void, TError>;

  /**
   * Stop one provider session.
   */
  readonly stopSession: (threadId: ThreadId) => Effect.Effect<void, TError>;

  /**
   * List currently active provider sessions for this adapter.
   */
  readonly listSessions: () => Effect.Effect<ReadonlyArray<ProviderAdapterSession>>;

  /**
   * Check whether this adapter owns an active session id.
   */
  readonly hasSession: (threadId: ThreadId) => Effect.Effect<boolean>;

  /**
   * Read a provider thread snapshot.
   */
  readonly readThread: (threadId: ThreadId) => Effect.Effect<ProviderThreadSnapshot, TError>;

  /**
   * Roll back a provider thread by N turns.
   */
  readonly rollbackThread: (
    threadId: ThreadId,
    numTurns: number,
  ) => Effect.Effect<ProviderThreadSnapshot, TError>;

  /** Optional absolute rollback for providers that own durable turn identities. */
  readonly rollbackThreadTo?: (
    threadId: ThreadId,
    target: ProviderThreadRollbackTarget,
  ) => Effect.Effect<ProviderThreadSnapshot, TError>;

  /**
   * Stop all sessions owned by this adapter.
   */
  readonly stopAll: () => Effect.Effect<void, TError>;

  /**
   * Canonical runtime event stream emitted by this adapter.
   */
  readonly streamEvents: Stream.Stream<ProviderRuntimeEvent>;
}
