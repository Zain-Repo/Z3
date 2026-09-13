import * as Effect from "effect/Effect";
import {
  ProviderInstanceId,
  type ImageGenerationInput,
  type VideoGenerationInput,
} from "@t3tools/contracts";
import { PrimaryEnvironmentHttpClient } from "../../environments/primary/httpClient";
import { runPrimaryHttp } from "../../lib/runtime";

export const flowApi = {
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
              provider === "civitai"
                ? { providerInstanceId: ProviderInstanceId.make("civitai") }
                : {},
          }),
        ),
      ),
      { signal },
    ),
  videoModels: (signal: AbortSignal) =>
    runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) => client.videoGeneration.models({ headers: {} })),
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
