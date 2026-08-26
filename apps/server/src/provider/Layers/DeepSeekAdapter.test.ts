import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/unstable/http";

import {
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSendTurnInput,
  ProviderSessionStartInput,
  ThreadId,
} from "@t3tools/contracts";

import {
  DEEPSEEK_DIRECT_IMAGE_SUPPORT_MESSAGE,
  makeDeepSeekAdapter,
} from "./DeepSeekAdapter.ts";

const decodeSendTurnInput = Schema.decodeSync(ProviderSendTurnInput);

describe("DeepSeekAdapter", () => {
  it.effect("explains the direct API image limitation before making a request", () => {
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
        const adapter = yield* makeDeepSeekAdapter({
          httpClient,
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-key",
          defaultModel: "deepseek-v4-flash",
          instanceId: "deepseek-test",
        });
        yield* adapter.startSession(sessionStartInput);

        const error = yield* Effect.flip(
          adapter.sendTurn(
            sendTurnInput,
          ),
        );

        expect(error).toEqual(
          expect.objectContaining({ issue: DEEPSEEK_DIRECT_IMAGE_SUPPORT_MESSAGE }),
        );
      })
    );
  });
});
