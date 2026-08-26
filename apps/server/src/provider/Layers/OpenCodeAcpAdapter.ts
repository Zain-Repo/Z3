/**
 * OpenCode ACP adapter.
 *
 * Local OpenCode instances speak ACP over stdio (`opencode acp`). The existing
 * SDK adapter remains responsible for explicitly configured remote servers;
 * this adapter owns the local process path and exposes ACP's native sessions,
 * permissions, tools, plans, model selection, and streamed reasoning.
 */
import {
  ApprovalRequestId,
  type ModelSelection,
  type OpenCodeSettings,
  EventId,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSession,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeRequestId,
  type ThreadId,
  TurnId,
  type ProviderUserInputAnswers,
} from "@t3tools/contracts";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";
import * as DateTime from "effect/DateTime";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";
import * as NodeURL from "node:url";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import { ServerConfig } from "../../config.ts";
import * as McpProviderSession from "../../mcp/McpProviderSession.ts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
} from "../Errors.ts";
import type { ProviderAdapterError } from "../Errors.ts";
import {
  mapAcpToAdapterError,
  selectAcpAutoApprovedPermissionOption,
  selectAcpPermissionOptionId,
} from "../acp/AcpAdapterSupport.ts";
import type * as AcpSessionRuntime from "../acp/AcpSessionRuntime.ts";
import {
  makeAcpAssistantItemEvent,
  makeAcpContentDeltaEvent,
  makeAcpPlanUpdatedEvent,
  makeAcpRequestOpenedEvent,
  makeAcpRequestResolvedEvent,
  makeAcpToolCallEvent,
} from "../acp/AcpCoreRuntimeEvents.ts";
import {
  type AcpSessionMode,
  type AcpSessionModeState,
  findSessionConfigOption,
  parsePermissionRequest,
} from "../acp/AcpRuntimeModel.ts";
import {
  makeOpenCodeAcpRuntime,
  currentOpenCodeModelIdFromSessionSetup,
} from "../acp/OpenCodeAcpSupport.ts";
import { makeAcpNativeLoggerFactory } from "../acp/AcpNativeLogging.ts";
import type { EventNdjsonLogger } from "./EventNdjsonLogger.ts";
import type { OpenCodeAdapterShape } from "../Services/OpenCodeAdapter.ts";

const PROVIDER = ProviderDriverKind.make("opencode");
const OPENCODE_RESUME_VERSION = 2 as const;

export interface OpenCodeAcpAdapterLiveOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly nativeEventLogger?: EventNdjsonLogger;
  readonly instanceId?: ProviderInstanceId;
}

interface PendingApproval {
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>;
}

interface OpenCodeSessionContext {
  readonly threadId: ThreadId;
  session: ProviderSession;
  readonly scope: Scope.Closeable;
  readonly acp: AcpSessionRuntime.AcpSessionRuntime["Service"];
  notificationFiber: Fiber.Fiber<void, never> | undefined;
  readonly pendingApprovals: Map<ApprovalRequestId, PendingApproval>;
  readonly turns: Array<{ id: TurnId; items: Array<unknown> }>;
  activeTurnId: TurnId | undefined;
  promptsInFlight: number;
  currentModelId: string | undefined;
  lastPlanFingerprint: string | undefined;
  stopped: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResumeCursor(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== OPENCODE_RESUME_VERSION) return undefined;
  return typeof raw.sessionId === "string" && raw.sessionId.trim()
    ? raw.sessionId.trim()
    : undefined;
}

function findMode(
  modeState: AcpSessionModeState | undefined,
  requested: string | undefined,
): AcpSessionMode | undefined {
  if (!modeState || !requested?.trim()) return undefined;
  const value = requested.trim().toLowerCase();
  return modeState.availableModes.find(
    (mode) => mode.id.toLowerCase() === value || mode.name.toLowerCase() === value,
  );
}

function selectMode(
  modeState: AcpSessionModeState | undefined,
  interactionMode: "plan" | "default" | undefined,
  agent: string | undefined,
): string | undefined {
  if (interactionMode === "plan") {
    return findMode(modeState, "plan")?.id;
  }
  return findMode(modeState, agent)?.id;
}

function selectedModel(
  input: { readonly modelSelection?: ModelSelection | undefined },
  boundInstanceId: ProviderInstanceId,
) {
  return input.modelSelection?.instanceId === boundInstanceId ? input.modelSelection : undefined;
}

function settlePendingApprovals(
  pending: ReadonlyMap<ApprovalRequestId, PendingApproval>,
): Effect.Effect<void> {
  return Effect.forEach(
    Array.from(pending.values()),
    (entry) => Deferred.succeed(entry.decision, "cancel"),
    {
      discard: true,
    },
  ).pipe(Effect.ignore);
}

export function makeOpenCodeAcpAdapter(
  openCodeSettings: OpenCodeSettings,
  options?: OpenCodeAcpAdapterLiveOptions,
): Effect.Effect<
  OpenCodeAdapterShape,
  ProviderAdapterError,
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | ServerConfig
  | Crypto.Crypto
  | Scope.Scope
> {
  return Effect.gen(function* () {
    const boundInstanceId = options?.instanceId ?? ProviderInstanceId.make("opencode");
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const serverConfig = yield* ServerConfig;
    const crypto = yield* Crypto.Crypto;
    const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
    const runtimeEvents = yield* PubSub.unbounded<ProviderRuntimeEvent>();
    const makeAcpNativeLoggers = yield* makeAcpNativeLoggerFactory();
    const sessions = new Map<ThreadId, OpenCodeSessionContext>();
    const pendingPermissionToolCallIds = new Set<string>();
    const locks = yield* SynchronizedRef.make(new Map<string, Semaphore.Semaphore>());

    const randomUUID = crypto.randomUUIDv4.pipe(
      Effect.mapError(
        (cause) =>
          new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "crypto/randomUUIDv4",
            detail: "Failed to generate an OpenCode ACP identifier.",
            cause,
          }),
      ),
    );
    const makeStamp = () =>
      Effect.all({ eventId: Effect.map(randomUUID, EventId.make), createdAt: nowIso });
    const emit = (event: ProviderRuntimeEvent) =>
      PubSub.publish(runtimeEvents, event).pipe(Effect.asVoid);
    const getLock = (threadId: ThreadId) =>
      SynchronizedRef.modifyEffect(locks, (current) => {
        const existing = current.get(threadId);
        if (existing) return Effect.succeed([existing, current] as const);
        return Semaphore.make(1).pipe(
          Effect.map((semaphore) => {
            const next = new Map(current);
            next.set(threadId, semaphore);
            return [semaphore, next] as const;
          }),
        );
      });
    const withLock = <A, E, R>(threadId: ThreadId, effect: Effect.Effect<A, E, R>) =>
      Effect.flatMap(getLock(threadId), (lock) => lock.withPermit(effect));
    const requireSession = (threadId: ThreadId) => {
      const context = sessions.get(threadId);
      return context && !context.stopped
        ? Effect.succeed(context)
        : Effect.fail(new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId }));
    };

    const stopInternal = (context: OpenCodeSessionContext) =>
      Effect.gen(function* () {
        if (context.stopped) return;
        context.stopped = true;
        yield* settlePendingApprovals(context.pendingApprovals);
        if (context.notificationFiber) yield* Fiber.interrupt(context.notificationFiber);
        yield* Effect.ignore(Scope.close(context.scope, Exit.void));
        sessions.delete(context.threadId);
        yield* emit({
          type: "session.exited",
          ...(yield* makeStamp()),
          provider: PROVIDER,
          threadId: context.threadId,
          payload: { exitKind: "graceful" },
        });
      });

    const configureSession = (input: {
      readonly acp: AcpSessionRuntime.AcpSessionRuntime["Service"];
      readonly modelId: string | undefined;
      readonly modelSelection: ReturnType<typeof selectedModel>;
      readonly interactionMode: "plan" | "default" | undefined;
      readonly threadId: ThreadId;
    }) =>
      Effect.gen(function* () {
        let modelId = input.modelId;
        const requestedModel = input.modelSelection?.model.trim();
        if (requestedModel && requestedModel !== modelId) {
          yield* input.acp
            .setModel(requestedModel)
            .pipe(
              Effect.mapError((cause) =>
                mapAcpToAdapterError(PROVIDER, input.threadId, "session/set_config_option", cause),
              ),
            );
          modelId = requestedModel;
        }

        const agent = getModelSelectionStringOptionValue(input.modelSelection, "agent");
        const modeId = selectMode(yield* input.acp.getModeState, input.interactionMode, agent);
        if (modeId) {
          yield* input.acp
            .setMode(modeId)
            .pipe(
              Effect.mapError((cause) =>
                mapAcpToAdapterError(PROVIDER, input.threadId, "session/set_mode", cause),
              ),
            );
        }

        const variant = getModelSelectionStringOptionValue(input.modelSelection, "variant");
        const effortOption = findSessionConfigOption(yield* input.acp.getConfigOptions, "effort");
        if (variant && effortOption?.type === "select") {
          const values = effortOption.options.flatMap((entry) =>
            "value" in entry ? [entry.value] : entry.options.map((option) => option.value),
          );
          if (values.includes(variant) && effortOption.currentValue !== variant) {
            yield* input.acp
              .setConfigOption(effortOption.id, variant)
              .pipe(
                Effect.mapError((cause) =>
                  mapAcpToAdapterError(
                    PROVIDER,
                    input.threadId,
                    "session/set_config_option",
                    cause,
                  ),
                ),
              );
          }
        }
        return modelId;
      });

    const startSession: OpenCodeAdapterShape["startSession"] = (input) =>
      withLock(
        input.threadId,
        Effect.gen(function* () {
          if (input.provider !== undefined && input.provider !== PROVIDER) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "startSession",
              issue: `Expected provider '${PROVIDER}'.`,
            });
          }
          if (!input.cwd?.trim()) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "startSession",
              issue: "cwd is required and must be non-empty.",
            });
          }
          const cwd = path.resolve(input.cwd.trim());
          const existing = sessions.get(input.threadId);
          if (existing) yield* stopInternal(existing);
          const sessionScope = yield* Scope.make("sequential");
          let transferred = false;
          yield* Effect.addFinalizer(() =>
            transferred ? Effect.void : Scope.close(sessionScope, Exit.void),
          );
          const pendingApprovals = new Map<ApprovalRequestId, PendingApproval>();
          const mcpSession = McpProviderSession.readMcpProviderSession(input.threadId);
          const resumeSessionId = parseResumeCursor(input.resumeCursor);
          const acpNativeLoggers = makeAcpNativeLoggers({
            nativeEventLogger: options?.nativeEventLogger,
            provider: PROVIDER,
            threadId: input.threadId,
          });
          const acp = yield* makeOpenCodeAcpRuntime({
            openCodeSettings,
            childProcessSpawner,
            cwd,
            ...(options?.environment ? { environment: options.environment } : {}),
            ...(resumeSessionId ? { resumeSessionId } : {}),
            clientInfo: { name: "t3-code", version: "0.0.0" },
            ...(mcpSession
              ? {
                  mcpServers: [
                    {
                      type: "http" as const,
                      name: "t3-code",
                      url: mcpSession.endpoint,
                      headers: [{ name: "Authorization", value: mcpSession.authorizationHeader }],
                    },
                  ],
                }
              : {}),
            ...acpNativeLoggers,
          }).pipe(
            Effect.provideService(Crypto.Crypto, crypto),
            Effect.provideService(Scope.Scope, sessionScope),
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: PROVIDER,
                  threadId: input.threadId,
                  detail: cause.message,
                  cause,
                }),
            ),
          );

          yield* acp.handleRequestPermission((params) =>
            Effect.gen(function* () {
              if (input.runtimeMode === "full-access") {
                const optionId = selectAcpAutoApprovedPermissionOption(params);
                if (optionId) {
                  return { outcome: { outcome: "selected" as const, optionId } };
                }
              }
              const permissionRequest = parsePermissionRequest(params);
              if (permissionRequest.toolCall) {
                pendingPermissionToolCallIds.add(permissionRequest.toolCall.toolCallId);
              }
              const requestId = ApprovalRequestId.make(yield* randomUUID);
              const runtimeRequestId = RuntimeRequestId.make(requestId);
              const decision = yield* Deferred.make<ProviderApprovalDecision>();
              pendingApprovals.set(requestId, { decision });
              yield* emit(
                makeAcpRequestOpenedEvent({
                  stamp: yield* makeStamp(),
                  provider: PROVIDER,
                  threadId: input.threadId,
                  turnId: undefined,
                  requestId: runtimeRequestId,
                  permissionRequest,
                  detail: permissionRequest.detail ?? "OpenCode permission required.",
                  args: params,
                  source: "acp.jsonrpc",
                  method: "session/request_permission",
                  rawPayload: params,
                }),
              );
              const resolved = yield* Deferred.await(decision);
              pendingApprovals.delete(requestId);
              if (permissionRequest.toolCall) {
                pendingPermissionToolCallIds.delete(permissionRequest.toolCall.toolCallId);
              }
              yield* emit(
                makeAcpRequestResolvedEvent({
                  stamp: yield* makeStamp(),
                  provider: PROVIDER,
                  threadId: input.threadId,
                  turnId: undefined,
                  requestId: runtimeRequestId,
                  permissionRequest,
                  decision: resolved,
                }),
              );
              const optionId =
                resolved === "cancel" ? undefined : selectAcpPermissionOptionId(params, resolved);
              return optionId
                ? { outcome: { outcome: "selected" as const, optionId } }
                : { outcome: { outcome: "cancelled" as const } };
            }).pipe(
              Effect.mapError(
                (cause) =>
                  new EffectAcpErrors.AcpTransportError({
                    detail: "Failed to process OpenCode ACP permission callback.",
                    cause,
                  }),
              ),
            ),
          );

          const started = yield* acp
            .start()
            .pipe(
              Effect.mapError((cause) =>
                mapAcpToAdapterError(PROVIDER, input.threadId, "session/start", cause),
              ),
            );
          const modelSelection = selectedModel(input, boundInstanceId);
          const modelId = yield* configureSession({
            acp,
            modelId: currentOpenCodeModelIdFromSessionSetup(started.sessionSetupResult),
            modelSelection,
            interactionMode: undefined,
            threadId: input.threadId,
          });
          const now = yield* nowIso;
          const session: ProviderSession = {
            provider: PROVIDER,
            providerInstanceId: boundInstanceId,
            status: "ready",
            runtimeMode: input.runtimeMode,
            cwd,
            threadId: input.threadId,
            resumeCursor: { schemaVersion: OPENCODE_RESUME_VERSION, sessionId: started.sessionId },
            ...(modelId ? { model: modelId } : {}),
            createdAt: now,
            updatedAt: now,
          };
          const context: OpenCodeSessionContext = {
            threadId: input.threadId,
            session,
            scope: sessionScope,
            acp,
            notificationFiber: undefined,
            pendingApprovals,
            turns: [],
            activeTurnId: undefined,
            promptsInFlight: 0,
            currentModelId: modelId,
            lastPlanFingerprint: undefined,
            stopped: false,
          };
          context.notificationFiber = yield* Stream.runDrain(
            Stream.mapEffect(acp.getEvents(), (event) =>
              Effect.gen(function* () {
                switch (event._tag) {
                  case "EventStreamBarrier":
                    yield* Deferred.succeed(event.acknowledge, undefined);
                    return;
                  case "ModeChanged":
                    return;
                  case "AssistantItemStarted":
                  case "AssistantItemCompleted":
                    yield* emit(
                      makeAcpAssistantItemEvent({
                        stamp: yield* makeStamp(),
                        provider: PROVIDER,
                        threadId: context.threadId,
                        turnId: context.activeTurnId,
                        itemId: event.itemId,
                        lifecycle:
                          event._tag === "AssistantItemStarted" ? "item.started" : "item.completed",
                      }),
                    );
                    return;
                  case "PlanUpdated":
                    yield* emit(
                      makeAcpPlanUpdatedEvent({
                        stamp: yield* makeStamp(),
                        provider: PROVIDER,
                        threadId: context.threadId,
                        turnId: context.activeTurnId,
                        payload: event.payload,
                        source: "acp.jsonrpc",
                        method: "session/update",
                        rawPayload: event.rawPayload,
                      }),
                    );
                    return;
                  case "ToolCallUpdated":
                    if (
                      event.toolCall.status === "inProgress" &&
                      pendingPermissionToolCallIds.has(event.toolCall.toolCallId)
                    ) {
                      return;
                    }
                    yield* emit(
                      makeAcpToolCallEvent({
                        stamp: yield* makeStamp(),
                        provider: PROVIDER,
                        threadId: context.threadId,
                        turnId: context.activeTurnId,
                        toolCall: event.toolCall,
                        rawPayload: event.rawPayload,
                      }),
                    );
                    return;
                  case "ContentDelta":
                    yield* emit(
                      makeAcpContentDeltaEvent({
                        stamp: yield* makeStamp(),
                        provider: PROVIDER,
                        threadId: context.threadId,
                        turnId: context.activeTurnId,
                        ...(event.itemId ? { itemId: event.itemId } : {}),
                        ...(event.streamKind ? { streamKind: event.streamKind } : {}),
                        text: event.text,
                        rawPayload: event.rawPayload,
                      }),
                    );
                    return;
                }
              }),
            ),
          ).pipe(
            Effect.catch(() => Effect.void),
            Effect.forkIn(context.scope),
          );
          sessions.set(input.threadId, context);
          transferred = true;
          yield* emit({
            type: "session.started",
            ...(yield* makeStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            payload: { resume: started.initializeResult },
          });
          yield* emit({
            type: "thread.started",
            ...(yield* makeStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            payload: { providerThreadId: started.sessionId },
          });
          return session;
        }).pipe(Effect.scoped),
      );

    const sendTurn: OpenCodeAdapterShape["sendTurn"] = (input) =>
      Effect.gen(function* () {
        const context = yield* requireSession(input.threadId);
        const steering = context.promptsInFlight > 0;
        context.promptsInFlight += 1;
        const modelSelection = selectedModel(input, boundInstanceId);
        if (input.modelSelection && !modelSelection) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "sendTurn",
            issue: `OpenCode model selection is bound to a different instance.`,
          });
        }
        const text = input.input?.trim();
        if ((!text || text.length === 0) && (input.attachments?.length ?? 0) === 0) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "sendTurn",
            issue: "OpenCode turns require text input or at least one attachment.",
          });
        }
        const turnId = context.activeTurnId ?? TurnId.make(`opencode-turn-${yield* randomUUID}`);
        context.activeTurnId = turnId;
        context.currentModelId = yield* configureSession({
          acp: context.acp,
          modelId: context.currentModelId,
          modelSelection,
          interactionMode: input.interactionMode,
          threadId: input.threadId,
        });
        context.session = {
          ...context.session,
          status: "running",
          activeTurnId: turnId,
          ...(context.currentModelId ? { model: context.currentModelId } : {}),
          updatedAt: yield* nowIso,
        };
        if (!steering) {
          yield* emit({
            type: "turn.started",
            ...(yield* makeStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            turnId,
            payload: {
              ...(context.currentModelId ? { model: context.currentModelId } : {}),
              ...(getModelSelectionStringOptionValue(modelSelection, "variant")
                ? { effort: getModelSelectionStringOptionValue(modelSelection, "variant") }
                : {}),
            },
          });
        }
        const prompt: Array<EffectAcpSchema.ContentBlock> = [];
        if (text) prompt.push({ type: "text", text });
        for (const attachment of input.attachments ?? []) {
          const attachmentPath = resolveAttachmentPath({
            attachmentsDir: serverConfig.attachmentsDir,
            attachment,
          });
          if (!attachmentPath) {
            return yield* new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "session/prompt",
              detail: `Invalid attachment id '${attachment.id}'.`,
            });
          }
          if (attachment.type === "image") {
            const bytes = yield* fileSystem.readFile(attachmentPath).pipe(
              Effect.mapError(
                (cause) =>
                  new ProviderAdapterRequestError({
                    provider: PROVIDER,
                    method: "session/prompt",
                    detail: cause.message,
                    cause,
                  }),
              ),
            );
            prompt.push({
              type: "image",
              data: Buffer.from(bytes).toString("base64"),
              mimeType: attachment.mimeType,
            });
          } else {
            prompt.push({
              type: "resource_link",
              uri: NodeURL.pathToFileURL(attachmentPath).href,
              name: attachment.name,
              mimeType: attachment.mimeType,
            });
          }
        }
        const result = yield* context.acp
          .prompt({ prompt })
          .pipe(
            Effect.mapError((cause) =>
              mapAcpToAdapterError(PROVIDER, input.threadId, "session/prompt", cause),
            ),
          );
        context.turns.push({ id: turnId, items: [{ prompt, result }] });
        context.session = {
          ...context.session,
          status: context.promptsInFlight === 1 ? "ready" : "running",
          updatedAt: yield* nowIso,
        };
        if (context.promptsInFlight === 1) {
          yield* emit({
            type: "turn.completed",
            ...(yield* makeStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            turnId,
            payload: {
              state: result.stopReason === "cancelled" ? "cancelled" : "completed",
              stopReason: result.stopReason ?? null,
            },
          });
          context.activeTurnId = undefined;
        }
        return { threadId: input.threadId, turnId, resumeCursor: context.session.resumeCursor };
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            const context = sessions.get(input.threadId);
            if (context) context.promptsInFlight = Math.max(0, context.promptsInFlight - 1);
          }),
        ),
      );

    const interruptTurn: OpenCodeAdapterShape["interruptTurn"] = (threadId) =>
      Effect.gen(function* () {
        const context = yield* requireSession(threadId);
        yield* settlePendingApprovals(context.pendingApprovals);
        yield* context.acp.cancel.pipe(
          Effect.mapError((cause) =>
            mapAcpToAdapterError(PROVIDER, threadId, "session/cancel", cause),
          ),
          Effect.ignore,
        );
      });

    const respondToRequest: OpenCodeAdapterShape["respondToRequest"] = (
      threadId,
      requestId,
      decision,
    ) =>
      Effect.gen(function* () {
        const context = yield* requireSession(threadId);
        const pending = context.pendingApprovals.get(requestId);
        if (!pending) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "session/request_permission",
            detail: `Unknown pending approval request: ${requestId}`,
          });
        }
        yield* Deferred.succeed(pending.decision, decision);
      });

    const respondToUserInput: OpenCodeAdapterShape["respondToUserInput"] = (
      threadId,
      requestId,
      _answers: ProviderUserInputAnswers,
    ) =>
      Effect.fail(
        new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: "session/elicitation",
          detail: `OpenCode ACP has no pending elicitation request: ${threadId}/${requestId}`,
        }),
      );

    const readThread: OpenCodeAdapterShape["readThread"] = (threadId) =>
      Effect.gen(function* () {
        const context = yield* requireSession(threadId);
        return { threadId, turns: context.turns, resumeCursor: context.session.resumeCursor };
      });
    const rollbackThread: OpenCodeAdapterShape["rollbackThread"] = (threadId, numTurns) =>
      Effect.gen(function* () {
        const context = yield* requireSession(threadId);
        if (!Number.isInteger(numTurns) || numTurns < 1) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "rollbackThread",
            issue: "numTurns must be an integer >= 1.",
          });
        }
        context.turns.splice(Math.max(0, context.turns.length - numTurns));
        return { threadId, turns: context.turns, resumeCursor: context.session.resumeCursor };
      });
    const stopSession: OpenCodeAdapterShape["stopSession"] = (threadId) =>
      withLock(threadId, requireSession(threadId).pipe(Effect.flatMap(stopInternal)));
    const listSessions: OpenCodeAdapterShape["listSessions"] = () =>
      Effect.succeed(Array.from(sessions.values(), (context) => context.session));
    const hasSession: OpenCodeAdapterShape["hasSession"] = (threadId) =>
      Effect.succeed(sessions.get(threadId)?.stopped === false);
    const stopAll: OpenCodeAdapterShape["stopAll"] = () =>
      Effect.forEach(sessions.values(), stopInternal, { discard: true });

    yield* Effect.addFinalizer(() =>
      stopAll().pipe(
        Effect.catch(() => Effect.void),
        Effect.tap(() => PubSub.shutdown(runtimeEvents)),
        Effect.ignore,
      ),
    );

    return {
      provider: PROVIDER,
      capabilities: { sessionModelSwitch: "in-session" },
      startSession,
      sendTurn,
      interruptTurn,
      respondToRequest,
      respondToUserInput,
      stopSession,
      listSessions,
      hasSession,
      readThread,
      rollbackThread,
      stopAll,
      streamEvents: Stream.fromPubSub(runtimeEvents),
    } satisfies OpenCodeAdapterShape;
  });
}
