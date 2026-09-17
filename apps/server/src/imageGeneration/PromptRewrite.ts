import { ImagePromptRewriteInput, ImagePromptRewriteResult } from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type { OpenRouterConnection } from "../provider/Layers/OpenRouterConnection.ts";
import { imagePromptRewriteMessages } from "../textGeneration/ImagePromptRewritePrompt.ts";

export class PromptRewriteError extends Data.TaggedError("PromptRewriteError")<{
  readonly message: string;
}> {}

const Completion = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      finish_reason: Schema.String,
      message: Schema.Struct({ content: Schema.String }),
    }),
  ),
});
const decodeInput = Schema.decodeUnknownEffect(ImagePromptRewriteInput);
const decodeCompletion = Schema.decodeUnknownEffect(Completion);
const decodeResult = Schema.decodeUnknownEffect(ImagePromptRewriteResult);

/** Rewrites a visual brief without granting the completion tools or workspace access. */
export const rewriteImagePrompt = Effect.fn("imageGeneration.rewriteImagePrompt")(
  function* (
    client: HttpClient.HttpClient,
    connection: OpenRouterConnection,
    input: ImagePromptRewriteInput,
  ) {
    const validated = yield* decodeInput(input).pipe(
      Effect.mapError(
        () =>
          new PromptRewriteError({
            message:
              "Enter a prompt of up to 10,000 characters and instructions of up to 4,000 characters.",
          }),
      ),
    );
    const response = yield* client
      .execute(
        HttpClientRequest.post(`${connection.baseUrl.replace(/\/+$/, "")}/chat/completions`).pipe(
          HttpClientRequest.bearerToken(connection.apiKey),
          HttpClientRequest.bodyJsonUnsafe({
            model: validated.model ?? "openrouter/auto",
            stream: false,
            store: false,
            max_completion_tokens: 2048,
            messages: imagePromptRewriteMessages(validated),
          }),
        ),
      )
      .pipe(
        Effect.mapError(
          () =>
            new PromptRewriteError({ message: "Could not reach OpenRouter. Try rewriting again." }),
        ),
      );
    if (response.status < 200 || response.status >= 300) {
      return yield* new PromptRewriteError({
        message:
          response.status === 401 || response.status === 403
            ? "Check your OpenRouter API key and model access in Settings > Providers."
            : response.status === 402
              ? "OpenRouter has insufficient credits for this rewrite."
              : response.status === 429
                ? "OpenRouter is rate limiting requests. Try again shortly."
                : "OpenRouter could not rewrite the prompt. Check the model and try again.",
      });
    }
    const completion = yield* response.json.pipe(
      Effect.flatMap(decodeCompletion),
      Effect.mapError(
        () =>
          new PromptRewriteError({ message: "OpenRouter returned an invalid prompt. Try again." }),
      ),
    );
    const choice = completion.choices[0];
    if (!choice || choice.finish_reason !== "stop") {
      return yield* new PromptRewriteError({
        message: "OpenRouter did not complete the rewrite. Try a shorter prompt or another model.",
      });
    }
    return yield* decodeResult({
      prompt: choice.message.content.trim(),
    }).pipe(
      Effect.mapError(
        () =>
          new PromptRewriteError({
            message: "OpenRouter returned an empty or oversized prompt. Try again.",
          }),
      ),
    );
  },
  Effect.timeout("60 seconds"),
  Effect.mapError((error) =>
    error._tag === "TimeoutError"
      ? new PromptRewriteError({ message: "Prompt rewriting timed out. Try again." })
      : error,
  ),
);
