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

import { DEEPSEEK_DIRECT_IMAGE_SUPPORT_MESSAGE, makeDeepSeekAdapter } from "./DeepSeekAdapter.ts";

const decodeSendTurnInput = Schema.decodeSync(ProviderSendTurnInput);
const decodeSessionStartInput = Schema.decodeSync(ProviderSessionStartInput);

describe("DeepSeekAdapter", () => {
  it.effect("rejects image attachments for non-vision models before making a request", () => {
    const threadId = ThreadId.make("deepseek-image-test");
    const providerInstanceId = ProviderInstanceId.make("deepseek-test");
    const sessionStartInput = Schema.decodeSync(ProviderSessionStartInput)({
      threadId,
      provider: ProviderDriverKind.make("deepseek"),
      providerInstanceId,
      modelSelection: { instanceId: providerInstanceId, model: "deepseek-v4-flash" },
      runtimeMode: "full-access",
    });
    const sendTurnInput = decodeSendTurnInput({
      threadId,
      input: "Describe this image.",
      attachments: [
        {
          type: "image",
          id: "deepseek-image-test-00000000-0000-4000-8000-000000000001",
          name: "image.png",
          mimeType: "image/png",
          sizeBytes: 3,
        },
      ],
    });

    return Effect.scoped(
      Effect.gen(function* () {
        const httpClient = HttpClient.make(() =>
          Effect.die(new Error("The DeepSeek client must not be called for image validation.")),
        );
        const baseFileSystem = yield* FileSystem.FileSystem;
        const adapter = yield* makeDeepSeekAdapter({
          httpClient,
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-key",
          defaultModel: "deepseek-v4-flash",
          instanceId: "deepseek-test",
          fileSystem: baseFileSystem,
          attachmentsDir: "C:\\t3-test-attachments",
        });
        yield* adapter.startSession(sessionStartInput);

        const error = yield* Effect.flip(adapter.sendTurn(sendTurnInput));

        expect(error).toEqual(
          expect.objectContaining({ issue: DEEPSEEK_DIRECT_IMAGE_SUPPORT_MESSAGE }),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  it.effect("sends local image attachments as DeepSeek vision content", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const attachmentsDir = "C:\\t3-test-attachments";
        const attachment = {
          type: "image" as const,
          id: "deepseek-image-test-00000000-0000-4000-8000-000000000002",
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
        const adapter = yield* makeDeepSeekAdapter({
          httpClient,
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-key",
          defaultModel: "deepseek-v4-flash-vision-exp",
          instanceId: "deepseek-test",
          fileSystem,
          attachmentsDir,
          streamCompletion: (input) => {
            capturedMessages.push(...input.messages);
            return Effect.succeed(
              Stream.make({ delta: "ok", done: false }, { delta: "", done: true }),
            ).pipe(Effect.tap(() => Deferred.succeed(completionStarted, undefined)));
          },
        });
        const threadId = ThreadId.make("deepseek-vision-test");
        const providerInstanceId = ProviderInstanceId.make("deepseek-test");
        yield* adapter.startSession(
          decodeSessionStartInput({
            threadId,
            provider: ProviderDriverKind.make("deepseek"),
            providerInstanceId,
            modelSelection: {
              instanceId: providerInstanceId,
              model: "deepseek-v4-flash-vision-exp",
            },
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
});
