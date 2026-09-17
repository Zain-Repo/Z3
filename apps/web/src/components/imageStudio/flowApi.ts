import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import {
  ProviderInstanceId,
  type ImageGenerationInput,
  type VideoGenerationInput,
} from "@t3tools/contracts";
import { PrimaryEnvironmentHttpClient } from "../../environments/primary/httpClient";
import { runPrimaryHttp } from "../../lib/runtime";

class PromptRewriteUnavailableError extends Data.TaggedError("PromptRewriteUnavailableError")<{
  readonly message: string;
}> {}

export const promptRewriteError = <E>(error: E): E | PromptRewriteUnavailableError =>
  HttpClientError.isHttpClientError(error) && error.response?.status === 404
    ? new PromptRewriteUnavailableError({
        message:
          "Prompt rewriting is unavailable on the connected server. Update or rebuild Z3, then restart the server and retry.",
      })
    : error;

export const flowApi = {
  rewritePrompt: (input: { prompt: string; instructions?: string }, signal: AbortSignal) =>
    runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) =>
          client.imageGeneration.rewritePrompt({ headers: {}, payload: input }),
        ),
        Effect.mapError(promptRewriteError),
      ),
      { signal },
    ),
  deleteImage: (id: string, signal: AbortSignal) =>
    runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) =>
          client.imageGeneration.deleteGeneration({ headers: {}, params: { id } }),
        ),
      ),
      { signal },
    ),
  imageModels: (provider: string, signal: AbortSignal) =>
    runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) =>
          client.imageGeneration.models({
            headers: {},
            query:
              provider === "civitai" || provider === "fal"
                ? { providerInstanceId: ProviderInstanceId.make(provider) }
                : {},
          }),
        ),
      ),
      { signal },
    ),
  videoModels: (signal: AbortSignal, provider = "openrouter") =>
    runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) =>
          client.videoGeneration.models({
            headers: {},
            query: provider === "fal" ? { providerInstanceId: ProviderInstanceId.make("fal") } : {},
          }),
        ),
      ),
      { signal },
    ),
  images: (signal: AbortSignal) =>
    runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) => client.imageGeneration.generations({ headers: {} })),
      ),
      { signal },
    ),
  videos: (signal: AbortSignal) =>
    runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) => client.videoGeneration.generations({ headers: {} })),
      ),
      { signal },
    ),
  image: (input: ImageGenerationInput, signal: AbortSignal) =>
    runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) =>
          client.imageGeneration.generate({ headers: {}, payload: input }),
        ),
      ),
      { signal },
    ),
  video: (input: VideoGenerationInput, signal: AbortSignal) =>
    runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) =>
          client.videoGeneration.generate({ headers: {}, payload: input }),
        ),
      ),
      { signal },
    ),
  content: (id: string, signal: AbortSignal) =>
    runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) =>
          client.imageGeneration.assetContent({ headers: {}, params: { id } }),
        ),
      ),
      { signal },
    ),
};
