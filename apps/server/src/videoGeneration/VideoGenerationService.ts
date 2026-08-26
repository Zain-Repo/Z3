import {
  type ProviderInstanceId,
  VideoGenerationInput,
  type VideoGenerationList,
  type VideoGenerationModel,
  type VideoGenerationRecord,
} from "@t3tools/contracts";
// @effect-diagnostics preferSchemaOverJson:off
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { ServerSettingsService } from "../serverSettings.ts";
import {
  createOpenRouterVideo,
  downloadOpenRouterVideo,
  fetchOpenRouterVideoJob,
  fetchOpenRouterVideoModels,
  type OpenRouterVideoJob,
  type OpenRouterVideoModel,
} from "../provider/Layers/OpenRouterApi.ts";
import { resolveOpenRouterConnection } from "../provider/Layers/OpenRouterConnection.ts";

export class VideoGenerationServiceError extends Data.TaggedError("VideoGenerationServiceError")<{
  readonly message: string;
}> {}

interface GenerationRow {
  readonly generation_id: string;
  readonly provider_job_id: string;
  readonly provider_instance_id: string | null;
  readonly model: string;
  readonly prompt: string | null;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at: string | null;
  readonly error: string | null;
  readonly usage_json: string | null;
}

interface AssetRow {
  readonly asset_id: string;
  readonly generation_id: string;
  readonly media_type: string;
  readonly size_bytes: number;
  readonly created_at: string;
}

interface AssetBytesRow {
  readonly media_type: string;
  readonly bytes: Uint8Array;
}

export interface VideoGenerationServiceShape {
  readonly listModels: (
    providerInstanceId?: ProviderInstanceId,
  ) => Effect.Effect<ReadonlyArray<VideoGenerationModel>, VideoGenerationServiceError>;
  readonly listGenerations: () => Effect.Effect<VideoGenerationList, VideoGenerationServiceError>;
  readonly generate: (
    input: VideoGenerationInput,
  ) => Effect.Effect<VideoGenerationRecord, VideoGenerationServiceError>;
  readonly deleteGeneration: (id: string) => Effect.Effect<boolean, VideoGenerationServiceError>;
  readonly readAsset: (
    id: string,
  ) => Effect.Effect<AssetBytesRow | null, VideoGenerationServiceError>;
}

const unconfiguredService: VideoGenerationServiceShape = {
  listModels: () =>
    Effect.fail(
      new VideoGenerationServiceError({ message: "Video generation is not configured." }),
    ),
  listGenerations: () =>
    Effect.fail(
      new VideoGenerationServiceError({ message: "Video generation is not configured." }),
    ),
  generate: () =>
    Effect.fail(
      new VideoGenerationServiceError({ message: "Video generation is not configured." }),
    ),
  deleteGeneration: () =>
    Effect.fail(
      new VideoGenerationServiceError({ message: "Video generation is not configured." }),
    ),
  readAsset: () =>
    Effect.fail(
      new VideoGenerationServiceError({ message: "Video generation is not configured." }),
    ),
};

export const VideoGenerationService = Context.Reference<VideoGenerationServiceShape>(
  "t3/videoGeneration/VideoGenerationService",
  { defaultValue: () => unconfiguredService },
);

function decodeUsage(value: string | null): unknown | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function bytesFromSql(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  return new Uint8Array();
}

function toVideoModel(model: OpenRouterVideoModel): VideoGenerationModel {
  return {
    id: model.id,
    ...(model.canonicalSlug ? { canonicalSlug: model.canonicalSlug } : {}),
    ...(model.name ? { name: model.name } : {}),
    ...(model.description ? { description: model.description } : {}),
    generateAudio: model.generateAudio,
    supportsSeed: model.supportsSeed,
    supportedDurations: model.supportedDurations,
    supportedResolutions: model.supportedResolutions,
    supportedAspectRatios: model.supportedAspectRatios,
    supportedFrameImages: model.supportedFrameImages,
    supportedSizes: model.supportedSizes,
    allowedPassthroughParameters: model.allowedPassthroughParameters,
    pricingSkus: model.pricingSkus,
  };
}

function toRecord(
  generation: GenerationRow,
  assets: ReadonlyArray<AssetRow>,
): VideoGenerationRecord {
  const usage = decodeUsage(generation.usage_json);
  const prompt = generation.prompt;
  const completedAt = generation.completed_at;
  return {
    id: generation.generation_id,
    providerJobId: generation.provider_job_id,
    model: generation.model,
    ...(prompt !== null ? { prompt } : {}),
    status: generation.status as VideoGenerationRecord["status"],
    createdAt: generation.created_at,
    updatedAt: generation.updated_at,
    ...(completedAt !== null ? { completedAt } : {}),
    ...(generation.error !== null ? { error: generation.error } : {}),
    ...(usage !== undefined ? { usage } : {}),
    assets: assets
      .filter((asset) => asset.generation_id === generation.generation_id)
      .map((asset) => ({
        id: asset.asset_id,
        mediaType: asset.media_type,
        sizeBytes: asset.size_bytes,
        createdAt: asset.created_at,
        url: `/api/videos/assets/${encodeURIComponent(asset.asset_id)}`,
      })),
  };
}

function safeProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().slice(0, 1000) || "OpenRouter video generation failed.";
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const httpClient = yield* HttpClient.HttpClient;
  const crypto = yield* Crypto.Crypto;
  const settingsService = yield* ServerSettingsService;

  const withConnection = (instanceId: ProviderInstanceId | undefined) =>
    Effect.gen(function* () {
      const settings = yield* settingsService.getSettings;
      return resolveOpenRouterConnection(settings, instanceId);
    }).pipe(
      Effect.mapError(
        () =>
          new VideoGenerationServiceError({ message: "Could not resolve OpenRouter settings." }),
      ),
    );

  const loadAssets = Effect.fn("videoGeneration.loadAssets")(function* (
    generationIds?: ReadonlyArray<string>,
  ) {
    return yield* sql<AssetRow>`
      SELECT asset_id, generation_id, media_type, length(bytes) AS size_bytes, created_at
      FROM projection_video_assets
      ${
        generationIds && generationIds.length > 0
          ? sql`WHERE generation_id IN ${sql.in(generationIds)}`
          : sql``
      }
      ORDER BY created_at ASC, asset_id ASC
    `;
  });

  const readGeneration = (id: string) =>
    Effect.gen(function* () {
      const rows = yield* sql<GenerationRow>`
        SELECT generation_id, provider_job_id, provider_instance_id, model, prompt, status,
          created_at, updated_at, completed_at, error, usage_json
        FROM projection_video_generations
        WHERE generation_id = ${id}
        LIMIT 1
      `;
      const generation = rows[0];
      if (!generation) return null;
      return toRecord(generation, yield* loadAssets([id]));
    });

  const updateJob = (generationId: string, job: OpenRouterVideoJob, updatedAt: string) =>
    sql`
      UPDATE projection_video_generations
      SET status = ${job.status},
          updated_at = ${updatedAt},
          completed_at = ${job.status === "completed" ? updatedAt : null},
          error = ${job.error ?? null},
          usage_json = ${job.usage === undefined ? null : JSON.stringify(job.usage)},
          unsigned_urls_json = ${job.unsignedUrls === undefined ? null : JSON.stringify(job.unsignedUrls)}
      WHERE generation_id = ${generationId}
    `;

  const persistCompletedVideo = (
    generationId: string,
    providerJobId: string,
    instanceId: ProviderInstanceId | undefined,
  ) =>
    Effect.gen(function* () {
      const existing = yield* sql<{ readonly asset_id: string }>`
        SELECT asset_id FROM projection_video_assets WHERE generation_id = ${generationId} LIMIT 1
      `;
      if (existing.length > 0) return;
      const connection = yield* withConnection(instanceId);
      const download = yield* downloadOpenRouterVideo({
        httpClient,
        baseUrl: connection.baseUrl,
        apiKey: connection.apiKey,
        jobId: providerJobId,
      });
      const assetId = yield* crypto.randomUUIDv4;
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      yield* sql`
        INSERT INTO projection_video_assets
          (asset_id, generation_id, media_type, bytes, created_at)
        VALUES (${assetId}, ${generationId}, ${download.mediaType}, ${Buffer.from(download.bytes)}, ${createdAt})
      `;
    });

  const markGenerationFailed = (generationId: string, cause: unknown) =>
    Effect.gen(function* () {
      const now = DateTime.formatIso(yield* DateTime.now);
      yield* sql`
        UPDATE projection_video_generations
        SET status = 'failed', updated_at = ${now}, error = ${safeProviderError(cause)}
        WHERE generation_id = ${generationId}
          AND status NOT IN ('cancelled', 'expired')
      `;
    });

  const pollGeneration = (
    generationId: string,
    providerJobId: string,
    instanceId: ProviderInstanceId | undefined,
  ) =>
    Effect.gen(function* () {
      const connection = yield* withConnection(instanceId);
      let job: OpenRouterVideoJob | undefined;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (attempt > 0) yield* Effect.sleep(Duration.seconds(30));
        job = yield* fetchOpenRouterVideoJob({
          httpClient,
          baseUrl: connection.baseUrl,
          apiKey: connection.apiKey,
          jobId: providerJobId,
        });
        const now = DateTime.formatIso(yield* DateTime.now);
        yield* updateJob(generationId, job, now);
        if (job.status === "completed") {
          yield* persistCompletedVideo(generationId, providerJobId, instanceId);
          return;
        }
        if (job.status === "failed" || job.status === "cancelled" || job.status === "expired")
          return;
      }
      const now = DateTime.formatIso(yield* DateTime.now);
      yield* sql`
        UPDATE projection_video_generations
        SET status = 'expired', updated_at = ${now}, error = 'Video generation polling timed out.'
        WHERE generation_id = ${generationId}
      `;
    }).pipe(Effect.catch((cause) => markGenerationFailed(generationId, cause)));

  const service: VideoGenerationServiceShape = {
    listModels: (providerInstanceId) =>
      Effect.gen(function* () {
        const connection = yield* withConnection(providerInstanceId);
        const models = yield* fetchOpenRouterVideoModels(
          httpClient,
          connection.baseUrl,
          connection.apiKey,
        );
        return models.map(toVideoModel);
      }).pipe(
        Effect.catch((cause) =>
          cause instanceof VideoGenerationServiceError
            ? Effect.fail(cause)
            : Effect.fail(
                new VideoGenerationServiceError({
                  message: "Could not load OpenRouter video models.",
                }),
              ),
        ),
      ),
    listGenerations: () =>
      Effect.gen(function* () {
        const generations = yield* sql<GenerationRow>`
          SELECT generation_id, provider_job_id, provider_instance_id, model, prompt, status,
            created_at, updated_at, completed_at, error, usage_json
          FROM projection_video_generations
          ORDER BY created_at DESC, generation_id DESC
        `;
        const assets = yield* loadAssets(generations.map((generation) => generation.generation_id));
        return { generations: generations.map((generation) => toRecord(generation, assets)) };
      }).pipe(
        Effect.mapError(
          () => new VideoGenerationServiceError({ message: "Could not load video generations." }),
        ),
      ),
    generate: (input) =>
      Effect.gen(function* () {
        const connection = yield* withConnection(input.providerInstanceId);
        const job = yield* createOpenRouterVideo({
          httpClient,
          baseUrl: connection.baseUrl,
          apiKey: connection.apiKey,
          model: input.model,
          ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
          ...(input.duration !== undefined ? { duration: input.duration } : {}),
          ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
          ...(input.aspectRatio !== undefined ? { aspectRatio: input.aspectRatio } : {}),
          ...(input.size !== undefined ? { size: input.size } : {}),
          ...(input.generateAudio !== undefined ? { generateAudio: input.generateAudio } : {}),
          ...(input.seed !== undefined ? { seed: input.seed } : {}),
          ...(input.frameImages !== undefined
            ? {
                frameImages: input.frameImages.map((frame) => ({
                  type: "image_url" as const,
                  image_url: { url: frame.url },
                  frame_type: frame.frameType,
                })),
              }
            : {}),
          ...(input.inputReferences !== undefined
            ? {
                inputReferences: input.inputReferences.map((reference) =>
                  reference.type === "image_url"
                    ? { type: "image_url" as const, image_url: { url: reference.url } }
                    : reference.type === "audio_url"
                      ? { type: "audio_url" as const, audio_url: { url: reference.url } }
                      : { type: "video_url" as const, video_url: { url: reference.url } },
                ),
              }
            : {}),
          ...(input.provider !== undefined ? { provider: input.provider } : {}),
          ...(input.callbackUrl !== undefined ? { callbackUrl: input.callbackUrl } : {}),
        });
        const generationId = yield* crypto.randomUUIDv4;
        const createdAt = DateTime.formatIso(yield* DateTime.now);
        yield* sql`
          INSERT INTO projection_video_generations
            (generation_id, provider_job_id, provider_instance_id, model, prompt, status,
              polling_url, created_at, updated_at, usage_json, unsigned_urls_json)
          VALUES (
            ${generationId}, ${job.id}, ${input.providerInstanceId ?? null}, ${input.model},
            ${input.prompt ?? null}, ${job.status}, ${job.pollingUrl ?? null}, ${createdAt},
            ${createdAt}, ${job.usage === undefined ? null : JSON.stringify(job.usage)},
            ${job.unsignedUrls === undefined ? null : JSON.stringify(job.unsignedUrls)}
          )
        `;
        if (job.status === "completed") {
          yield* persistCompletedVideo(generationId, job.id, input.providerInstanceId).pipe(
            Effect.catch((cause) => markGenerationFailed(generationId, cause)),
          );
        } else if (
          job.status !== "failed" &&
          job.status !== "cancelled" &&
          job.status !== "expired"
        ) {
          yield* pollGeneration(generationId, job.id, input.providerInstanceId).pipe(
            Effect.forkDetach,
            Effect.asVoid,
          );
        }
        const result = yield* readGeneration(generationId);
        if (!result)
          return yield* new VideoGenerationServiceError({
            message: "Video generation was not persisted.",
          });
        return result;
      }).pipe(
        Effect.catch((cause) =>
          cause instanceof VideoGenerationServiceError
            ? Effect.fail(cause)
            : Effect.fail(new VideoGenerationServiceError({ message: "Video generation failed." })),
        ),
      ),
    deleteGeneration: (id) =>
      Effect.gen(function* () {
        const existing = yield* sql<{ readonly generation_id: string }>`
          SELECT generation_id FROM projection_video_generations WHERE generation_id = ${id} LIMIT 1
        `;
        if (existing.length === 0) return false;
        yield* sql`DELETE FROM projection_video_generations WHERE generation_id = ${id}`;
        return true;
      }).pipe(
        Effect.mapError(
          () => new VideoGenerationServiceError({ message: "Could not delete video generation." }),
        ),
      ),
    readAsset: (id) =>
      sql<AssetBytesRow>`
        SELECT media_type, bytes FROM projection_video_assets WHERE asset_id = ${id} LIMIT 1
      `.pipe(
        Effect.map((rows) => {
          const row = rows[0];
          return row ? { media_type: row.media_type, bytes: bytesFromSql(row.bytes) } : null;
        }),
        Effect.mapError(
          () => new VideoGenerationServiceError({ message: "Could not read video asset." }),
        ),
      ),
  };

  const pendingGenerations = yield* sql<{
    readonly generation_id: string;
    readonly provider_job_id: string;
    readonly provider_instance_id: ProviderInstanceId | null;
  }>`
    SELECT generation_id, provider_job_id, provider_instance_id
    FROM projection_video_generations
    WHERE status IN ('pending', 'in_progress')
  `;
  for (const generation of pendingGenerations) {
    yield* pollGeneration(
      generation.generation_id,
      generation.provider_job_id,
      generation.provider_instance_id ?? undefined,
    ).pipe(Effect.forkDetach, Effect.asVoid);
  }

  return service;
});

export const layer = Layer.effect(VideoGenerationService, make);
