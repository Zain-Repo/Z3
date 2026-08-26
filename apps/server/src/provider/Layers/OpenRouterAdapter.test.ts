import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient } from "effect/unstable/http";

import {
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSendTurnInput,
  ProviderSessionStartInput,
  ThreadId,
} from "@t3tools/contracts";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import { makeOpenAICompatibleAdapter } from "./OpenRouterAdapter.ts";

const decodeSendTurnInput = Schema.decodeSync(ProviderSendTurnInput);
const decodeSessionStartInput = Schema.decodeSync(ProviderSessionStartInput);

describe("OpenRouterAdapter", () => {
  it.effect("loads image attachments into multimodal completion messages", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const attachmentsDir = "C:\\t3-test-attachments";
        const attachment = {
          type: "image" as const,
          id: "openrouter-image-test-00000000-0000-4000-8000-000000000001",
          name: "image.png",
          mimeType: "image/png",
          sizeBytes: 3,
        };
        const attachmentPath = resolveAttachmentPath({ attachmentsDir, attachment });
        if (!attachmentPath) throw new Error("Test attachment path could not be resolved.");

        const baseFileSystem = yield* FileSystem.FileSystem;
        const fileSystem = FileSystem.FileSystem.of({
          ...baseFileSystem,
          readFile: (path) =>
            path === attachmentPath
              ? Effect.succeed(new Uint8Array([1, 2, 3]))
              : baseFileSystem.readFile(path),
        });
        const capturedMessages: Array<unknown> = [];
        const completionStarted = yield* Deferred.make<void>();
        const httpClient = HttpClient.make(() =>
          Effect.die(new Error("The mocked completion must not use HTTP.")),
        );
        const adapter = yield* makeOpenAICompatibleAdapter({
          httpClient,
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "test-key",
          defaultModel: "openai/test",
          instanceId: "openrouter-test",
          provider: ProviderDriverKind.make("openrouter"),
          providerLabel: "OpenRouter",
          idPrefix: "openrouter-test",
          fileSystem,
          attachmentsDir,
          streamCompletion: (input) => {
            capturedMessages.push(...input.messages);
            return Effect.succeed(
              Stream.make(
                { delta: "ok", done: false },
                { delta: "", done: true },
              ),
            ).pipe(Effect.tap(() => Deferred.succeed(completionStarted, undefined)));
          },
        });

        const threadId = ThreadId.make("openrouter-image-test");
        const providerInstanceId = ProviderInstanceId.make("openrouter-test");
        yield* adapter.startSession(
          decodeSessionStartInput({
            threadId,
            provider: ProviderDriverKind.make("openrouter"),
            providerInstanceId,
            modelSelection: { instanceId: providerInstanceId, model: "openai/test" },
            runtimeMode: "full-access",
          }),
        );
        yield* adapter.sendTurn(
          decodeSendTurnInput({
            threadId,
            input: "Describe this image.",
            attachments: [attachment],
          }),
        );
        yield* Deferred.await(completionStarted);

        expect(capturedMessages[0]).toEqual({
          role: "user",
          content: [
            { type: "text", text: "Describe this image." },
            { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
          ],
        });
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );

  it.effect("executes a streamed workspace tool call and resumes the turn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const completionFinished = yield* Deferred.make<void>();
        const toolInvocations: Array<unknown> = [];
        const capturedInputs: Array<{ readonly tools?: unknown; readonly messages: unknown }> = [];
        let completionCount = 0;
        const toolSupport = {
          definitions: [
            {
              type: "function" as const,
              function: {
                name: "read_file",
                description: "Read a file.",
                parameters: { type: "object" },
              },
            },
          ],
          approvalKind: () => "none" as const,
          execute: (input: unknown) =>
            Effect.sync(() => {
              toolInvocations.push(input);
              return '{"contents":"workspace file contents"}';
            }),
        };
        const httpClient = HttpClient.make(() =>
          Effect.die(new Error("The mocked completion must not use HTTP.")),
        );
        const adapter = yield* makeOpenAICompatibleAdapter({
          httpClient,
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-key",
          defaultModel: "deepseek-v4-flash",
          instanceId: "deepseek-test",
          provider: ProviderDriverKind.make("deepseek"),
          providerLabel: "DeepSeek",
          idPrefix: "deepseek-test",
          supportsTools: true,
          toolSupport,
          streamCompletion: (input) => {
            capturedInputs.push({ tools: input.tools, messages: input.messages });
            completionCount += 1;
            if (completionCount === 1) {
              return Effect.succeed(
                Stream.make({
                  delta: "",
                  done: false,
                  toolCallDeltas: [
                    {
                      index: 0,
                      id: "call-1",
                      name: "read_file",
                      argumentsDelta: '{"path":"README.md"}',
                    },
                  ],
                }),
              );
            }
            return Deferred.succeed(completionFinished, undefined).pipe(
              Effect.as(Stream.make({ delta: "I inspected the project.", done: false })),
            );
          },
        });

        const threadId = ThreadId.make("deepseek-tools-test");
        const providerInstanceId = ProviderInstanceId.make("deepseek-test");
        yield* adapter.startSession(
          decodeSessionStartInput({
            threadId,
            provider: ProviderDriverKind.make("deepseek"),
            providerInstanceId,
            modelSelection: { instanceId: providerInstanceId, model: "deepseek-v4-flash" },
            runtimeMode: "full-access",
            cwd: "D:\\workspace",
          }),
        );
        yield* adapter.sendTurn(
          decodeSendTurnInput({ threadId, input: "Inspect the project." }),
        );
        yield* Deferred.await(completionFinished);

        expect(capturedInputs[0]?.tools).toEqual(toolSupport.definitions);
        expect(capturedInputs[1]?.messages).toEqual(
          expect.arrayContaining([
            {
              role: "tool",
              content: '{"contents":"workspace file contents"}',
              tool_call_id: "call-1",
              name: "read_file",
            },
          ]),
        );
        expect(toolInvocations).toEqual([
          {
            name: "read_file",
            arguments: { path: "README.md" },
            cwd: "D:\\workspace",
            runtimeMode: "full-access",
          },
        ]);
      }),
    ),
  );
});
