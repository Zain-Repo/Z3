import {
  ImageGenerationInput,
  type ImageGenerationList,
  type ImageGenerationModel,
  type ImageGenerationModelEndpoints,
  type ImageGenerationRecord,
  ProviderInstanceId,
} from "@t3tools/contracts";
// @effect-diagnostics preferSchemaOverJson:off
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { ServerSettingsService } from "../serverSettings.ts";
import {
  fetchOpenRouterImageModelEndpoints,
  fetchOpenRouterImageModels,
  generateOpenRouterImage,
  normalizeOpenRouterImageMimeType,
  type OpenRouterImageModel,
  type OpenRouterImageModelEndpoint,
} from "../provider/Layers/OpenRouterApi.ts";
import { resolveOpenRouterConnection } from "../provider/Layers/OpenRouterConnection.ts";

export class ImageGenerationServiceError extends Data.TaggedError("ImageGenerationServiceError")<{
  readonly message: string;
}> {}

interface GenerationRow {
  readonly generation_id: string;
  readonly model: string;
  readonly prompt: string;
  readonly created_at: string;
  readonly completed_at: string;
  readonly usage_json: string | null;
  readonly input_json: string | null;
}

interface AssetRow {
  readonly asset_id: string;
  readonly generation_id: string;
  readonly media_type: string;
  readonly size_bytes: number;
  readonly revised_prompt: string | null;
  readonly created_at: string;
}

interface AssetBytesRow {
  readonly media_type: string;
  readonly bytes: Uint8Array;
}

export interface ImageGenerationServiceShape {
  readonly listModels: (
    providerInstanceId?: ProviderInstanceId,
  ) => Effect.Effect<
    { readonly models: ReadonlyArray<ImageGenerationModel> },
    ImageGenerationServiceError
  >;
  readonly listModelEndpoints: (
    model: string,
    providerInstanceId?: ProviderInstanceId,
  ) => Effect.Effect<ImageGenerationModelEndpoints, ImageGenerationServiceError>;
  readonly listGenerations: () => Effect.Effect<ImageGenerationList, ImageGenerationServiceError>;
  readonly generate: (
    input: ImageGenerationInput,
  ) => Effect.Effect<ImageGenerationRecord, ImageGenerationServiceError>;
  readonly deleteGeneration: (id: string) => Effect.Effect<boolean, ImageGenerationServiceError>;
  readonly readAsset: (
    id: string,
  ) => Effect.Effect<AssetBytesRow | null, ImageGenerationServiceError>;
}

const unconfiguredService: ImageGenerationServiceShape = {
  listModels: () =>
    Effect.fail(
      new ImageGenerationServiceError({ message: "Image generation is not configured." }),
    ),
  listModelEndpoints: () =>
    Effect.fail(
      new ImageGenerationServiceError({ message: "Image generation is not configured." }),
    ),
  listGenerations: () =>
    Effect.fail(
      new ImageGenerationServiceError({ message: "Image generation is not configured." }),
    ),
  generate: () =>
    Effect.fail(
      new ImageGenerationServiceError({ message: "Image generation is not configured." }),
    ),
  deleteGeneration: () =>
    Effect.fail(
      new ImageGenerationServiceError({ message: "Image generation is not configured." }),
    ),
  readAsset: () =>
    Effect.fail(
      new ImageGenerationServiceError({ message: "Image generation is not configured." }),
    ),
};

export const ImageGenerationService = Context.Reference<ImageGenerationServiceShape>(
  "t3/imageGeneration/ImageGenerationService",
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

const ImageGenerationInputJson = Schema.fromJsonString(ImageGenerationInput);
const decodeInput = Schema.decodeUnknownOption(ImageGenerationInputJson);

function decodeGenerationInput(value: string | null): ImageGenerationInput | undefined {
  if (!value) return undefined;
  try {
    return Option.getOrUndefined(decodeInput(value));
  } catch {
    return undefined;
  }
}

function bytesFromSql(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  return new Uint8Array();
}

function toImageModel(model: OpenRouterImageModel): ImageGenerationModel {
  return {
    id: model.id,
    ...(model.name ? { name: model.name } : {}),
    inputModalities: model.inputModalities ?? [],
    outputModalities: model.outputModalities ?? [],
    supportedParameters: model.imageGeneration.supportedParameters,
    supportsStreaming: model.imageGeneration.supportsStreaming,
  };
}

function toImageEndpoint(endpoint: OpenRouterImageModelEndpoint) {
  return {
    ...(endpoint.providerName ? { providerName: endpoint.providerName } : {}),
    ...(endpoint.providerSlug ? { providerSlug: endpoint.providerSlug } : {}),
    ...(endpoint.providerTag ? { providerTag: endpoint.providerTag } : {}),
    allowedPassthroughParameters: endpoint.allowedPassthroughParameters,
    supportedParameters: endpoint.supportedParameters,
    supportsStreaming: endpoint.supportsStreaming,
    pricing: endpoint.pricing,
  };
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
      Effect.catch((cause) =>
        cause instanceof ImageGenerationServiceError
          ? Effect.fail(cause)
          : Effect.fail(
              new ImageGenerationServiceError({
                message: "Could not resolve OpenRouter settings.",
              }),
            ),
      ),
    );

  const loadAssets = Effect.fn("imageGeneration.loadAssets")(function* (
    generationIds?: ReadonlyArray<string>,
  ) {
    const assets = yield* sql<AssetRow>`
      SELECT asset_id, generation_id, media_type, length(bytes) AS size_bytes, revised_prompt, created_at
      FROM projection_image_assets
      ${
        generationIds && generationIds.length > 0
          ? sql`WHERE generation_id IN ${sql.in(generationIds)}`
          : sql``
      }
      ORDER BY created_at ASC, asset_id ASC
    `;
    return assets;
  });

  const toRecord = (
    generation: GenerationRow,
    assets: ReadonlyArray<AssetRow>,
  ): ImageGenerationRecord => {
    const input = decodeGenerationInput(generation.input_json);
    return {
      id: generation.generation_id,
      model: generation.model,
      prompt: generation.prompt,
      ...(input ? { input } : {}),
      createdAt: generation.created_at,
      completedAt: generation.completed_at,
      ...(decodeUsage(generation.usage_json) !== undefined
        ? { usage: decodeUsage(generation.usage_json) }
        : {}),
      assets: assets
        .filter((asset) => asset.generation_id === generation.generation_id)
        .map((asset) => ({
          id: asset.asset_id,
          mediaType: asset.media_type,
          sizeBytes: asset.size_bytes,
          ...(asset.revised_prompt ? { revisedPrompt: asset.revised_prompt } : {}),
          createdAt: asset.created_at,
          url: `/api/images/assets/${encodeURIComponent(asset.asset_id)}`,
        })),
    };
  };

  const service: ImageGenerationServiceShape = {
    listModels: (providerInstanceId) =>
      Effect.gen(function* () {
        const connection = yield* withConnection(providerInstanceId);
        const models = yield* fetchOpenRouterImageModels(
          httpClient,
          connection.baseUrl,
          connection.apiKey,
        );
        return { models: models.map(toImageModel) };
      }).pipe(
        Effect.catch((cause) =>
          cause instanceof ImageGenerationServiceError
            ? Effect.fail(cause)
            : Effect.fail(
                new ImageGenerationServiceError({
                  message: "Could not load OpenRouter image models.",
                }),
              ),
        ),
      ),
    listModelEndpoints: (model, providerInstanceId) =>
      Effect.gen(function* () {
        const connection = yield* withConnection(providerInstanceId);
        const result = yield* fetchOpenRouterImageModelEndpoints(
          httpClient,
          connection.baseUrl,
          connection.apiKey,
          model,
        );
        return {
          id: result.id,
          endpoints: result.endpoints.map(toImageEndpoint),
        };
      }).pipe(
        Effect.catch((cause) =>
          cause instanceof ImageGenerationServiceError
            ? Effect.fail(cause)
            : Effect.fail(
                new ImageGenerationServiceError({
                  message: "Could not load image model endpoints.",
                }),
              ),
        ),
      ),
    listGenerations: () =>
      Effect.gen(function* () {
        const generations = yield* sql<GenerationRow>`
          SELECT generation_id, model, prompt, created_at, completed_at, usage_json, input_json
          FROM projection_image_generations
          ORDER BY created_at DESC, generation_id DESC
        `;
        const assets = yield* loadAssets(generations.map((generation) => generation.generation_id));
        return { generations: generations.map((generation) => toRecord(generation, assets)) };
      }).pipe(
        Effect.mapError(
          () => new ImageGenerationServiceError({ message: "Could not load image generations." }),
        ),
      ),
    generate: (input) =>
      Effect.gen(function* () {
        const connection = yield* withConnection(input.providerInstanceId);
        const result = yield* generateOpenRouterImage({
          httpClient,
          baseUrl: connection.baseUrl,
          apiKey: connection.apiKey,
          model: input.model,
          prompt: input.prompt,
          ...(input.stream !== undefined ? { stream: input.stream } : {}),
          ...(input.n !== undefined ? { n: input.n } : {}),
          ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
          ...(input.aspectRatio !== undefined ? { aspectRatio: input.aspectRatio } : {}),
          ...(input.size !== undefined ? { size: input.size } : {}),
          ...(input.quality !== undefined ? { quality: input.quality } : {}),
          ...(input.outputFormat !== undefined ? { outputFormat: input.outputFormat } : {}),
          ...(input.background !== undefined ? { background: input.background } : {}),
          ...(input.outputCompression !== undefined
            ? { outputCompression: input.outputCompression }
            : {}),
          ...(input.seed !== undefined ? { seed: input.seed } : {}),
          ...(input.inputReferences !== undefined
            ? {
                inputReferences: input.inputReferences.map((reference) => ({
                  type: "image_url" as const,
                  image_url: { url: reference.url },
                })),
              }
            : {}),
          ...(input.provider !== undefined ? { provider: input.provider } : {}),
        });
        const generationId = yield* crypto.randomUUIDv4;
        const createdAt = DateTime.formatIso(yield* DateTime.now);
        const usageJson = result.usage === undefined ? null : JSON.stringify(result.usage);
        yield* sql`
          INSERT INTO projection_image_generations
            (generation_id, model, prompt, created_at, completed_at, usage_json, input_json)
          VALUES (${generationId}, ${input.model}, ${input.prompt}, ${createdAt}, ${createdAt}, ${usageJson}, ${JSON.stringify(input)})
        `;
        const assetRows: Array<AssetRow> = [];
        for (const image of result.data) {
          const mediaType =
            normalizeOpenRouterImageMimeType(image.mediaType ?? "image/png") ?? "image/png";
          const bytes = Buffer.from(image.b64Json, "base64");
          const assetId = yield* crypto.randomUUIDv4;
          yield* sql`
            INSERT INTO projection_image_assets
              (asset_id, generation_id, media_type, bytes, revised_prompt, created_at)
            VALUES (${assetId}, ${generationId}, ${mediaType}, ${bytes}, ${image.revisedPrompt ?? null}, ${createdAt})
          `;
          assetRows.push({
            asset_id: assetId,
            generation_id: generationId,
            media_type: mediaType,
            size_bytes: bytes.byteLength,
            revised_prompt: image.revisedPrompt ?? null,
            created_at: createdAt,
          });
        }
        return toRecord(
          {
            generation_id: generationId,
            model: input.model,
            prompt: input.prompt,
            created_at: createdAt,
            completed_at: createdAt,
            usage_json: usageJson,
            input_json: JSON.stringify(input),
          },
          assetRows,
        );
      }).pipe(
        Effect.catch((cause) =>
          cause instanceof ImageGenerationServiceError
            ? Effect.fail(cause)
            : Effect.fail(new ImageGenerationServiceError({ message: "Image generation failed." })),
        ),
      ),
    deleteGeneration: (id) =>
      Effect.gen(function* () {
        const existing = yield* sql<{ readonly generation_id: string }>`
          SELECT generation_id
          FROM projection_image_generations
          WHERE generation_id = ${id}
          LIMIT 1
        `;
        if (existing.length === 0) return false;
        yield* sql`DELETE FROM projection_image_generations WHERE generation_id = ${id}`;
        return true;
      }).pipe(
        Effect.mapError(
          () => new ImageGenerationServiceError({ message: "Could not delete image generation." }),
        ),
      ),
    readAsset: (id) =>
      sql<AssetBytesRow>`
        SELECT media_type, bytes
        FROM projection_image_assets
        WHERE asset_id = ${id}
        LIMIT 1
      `.pipe(
        Effect.map((rows) => {
          const row = rows[0];
          return row ? { media_type: row.media_type, bytes: bytesFromSql(row.bytes) } : null;
        }),
        Effect.mapError(
          () => new ImageGenerationServiceError({ message: "Could not read image asset." }),
        ),
      ),
  };

  return service;
});

export const layer = Layer.effect(ImageGenerationService, make);
