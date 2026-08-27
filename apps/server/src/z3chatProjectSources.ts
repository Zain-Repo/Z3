import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient } from "effect/unstable/http";

import {
  Z3ChatProjectSourceDeleteResult,
  Z3ChatProjectSourceError,
  Z3ChatSourceIndexStatus,
  type Z3ChatProjectSourceDeleteInput,
  type Z3ChatProjectSourceUploadInput,
  type Z3ChatProjectSourceUploadResult,
} from "@t3tools/contracts";

import * as ServerSettings from "./serverSettings.ts";
import { createOpenRouterEmbeddings } from "./provider/Layers/OpenRouterApi.ts";
import { resolveOpenRouterConnection } from "./provider/Layers/OpenRouterConnection.ts";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_NAME_LENGTH = 255;
const EMBEDDING_CHUNK_CHARACTERS = 1_500;
const EMBEDDING_CHUNK_OVERLAP = 150;
const EMBEDDING_BATCH_SIZE = 32;

interface StoredSourceEmbedding {
  readonly text: string;
  readonly embedding: ReadonlyArray<number>;
}

interface StoredSourceIndex {
  readonly projectId: string;
  readonly sourceId: string;
  readonly fileName: string;
  readonly embeddingModel: string;
  readonly embeddings: ReadonlyArray<StoredSourceEmbedding>;
  readonly indexedAt: string;
}

const sourceError = (code: "not_configured" | "invalid_input" | "openrouter", message: string) =>
  new Z3ChatProjectSourceError({ code, message });

const decodeBase64 = Effect.fn("Z3ChatProjectSources.decodeBase64")(function* (value: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return yield* sourceError("invalid_input", "The source content is invalid.");
  }

  return yield* Effect.try({
    try: () => {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    },
    catch: () => sourceError("invalid_input", "The source content is invalid."),
  });
});

function chunkSource(fileName: string, contents: string): ReadonlyArray<string> {
  const normalized = contents.trim();
  if (normalized.length === 0) {
    return [`${fileName}\n[The source has no extractable text.]`];
  }

  const chunks: Array<string> = [];
  const step = EMBEDDING_CHUNK_CHARACTERS - EMBEDDING_CHUNK_OVERLAP;
  for (let offset = 0; offset < normalized.length; offset += step) {
    chunks.push(`${fileName}\n${normalized.slice(offset, offset + EMBEDDING_CHUNK_CHARACTERS)}`);
  }
  return chunks;
}

function batches<T>(values: ReadonlyArray<T>, size: number): ReadonlyArray<ReadonlyArray<T>> {
  const result: Array<ReadonlyArray<T>> = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const indexes = new Map<string, StoredSourceIndex>();

  const resolveConnection = serverSettings.getSettings.pipe(
    Effect.mapError(() => sourceError("openrouter", "OpenRouter settings could not be read.")),
    Effect.flatMap((settings) =>
      Effect.try({
        try: () => resolveOpenRouterConnection(settings, undefined),
        catch: () =>
          sourceError(
            "not_configured",
            "Configure an OpenRouter provider with an API key before indexing sources.",
          ),
      }),
    ),
  );

  const uploadAndIndex = Effect.fn("Z3ChatProjectSources.uploadAndIndex")(function* (
    input: Z3ChatProjectSourceUploadInput,
  ): Effect.fn.Return<Z3ChatProjectSourceUploadResult, Z3ChatProjectSourceError> {
    if (input.fileName.length > MAX_FILE_NAME_LENGTH || input.mimeType.length > 128) {
      return yield* sourceError("invalid_input", "The source metadata is too long.");
    }

    const bytes = yield* decodeBase64(input.contentBase64);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_BYTES) {
      return yield* sourceError("invalid_input", "The source must be between 1 byte and 5 MB.");
    }

    const connection = yield* resolveConnection;
    const chunks = chunkSource(input.fileName, new TextDecoder().decode(bytes));
    const embeddingBatches = yield* Effect.forEach(
      batches(chunks, EMBEDDING_BATCH_SIZE),
      (batch) =>
        createOpenRouterEmbeddings({
          httpClient,
          baseUrl: connection.baseUrl,
          apiKey: connection.apiKey,
          model: input.embeddingModel,
          inputs: batch,
        }).pipe(
          Effect.mapError(
            (error) =>
              sourceError(
                "openrouter",
                error.message || "OpenRouter could not create embeddings for this source.",
              ),
          ),
        ),
      { concurrency: 1 },
    );
    const embeddings = embeddingBatches.flatMap((batch) => batch);
    const embeddingDimensions = embeddings[0]?.length ?? 0;
    if (
      embeddingDimensions === 0 ||
      embeddings.some((embedding) => embedding.length !== embeddingDimensions)
    ) {
      return yield* sourceError("openrouter", "OpenRouter returned incompatible embeddings.");
    }

    const key = `${input.projectId}:${input.sourceId}`;
    const indexedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
    indexes.set(key, {
      projectId: input.projectId,
      sourceId: input.sourceId,
      fileName: input.fileName,
      embeddingModel: input.embeddingModel,
      embeddings: chunks.map((text, index) => ({
        text,
        embedding: embeddings[index]!,
      })),
      indexedAt,
    });

    return {
      sourceId: input.sourceId,
      embeddingModel: input.embeddingModel,
      embeddingDimensions,
      chunkCount: embeddings.length,
      indexedAt,
      status: "completed" satisfies Z3ChatSourceIndexStatus,
    };
  });

  const remove = Effect.fn("Z3ChatProjectSources.remove")(function* (
    input: Z3ChatProjectSourceDeleteInput,
  ): Effect.fn.Return<Z3ChatProjectSourceDeleteResult, Z3ChatProjectSourceError> {
    indexes.delete(`${input.projectId}:${input.sourceId}`);
    return { deleted: true };
  });

  return Z3ChatProjectSourceService.of({ uploadAndIndex, remove });
});

export class Z3ChatProjectSourceService extends Context.Service<
  Z3ChatProjectSourceService,
  {
    readonly uploadAndIndex: (
      input: Z3ChatProjectSourceUploadInput,
    ) => Effect.Effect<Z3ChatProjectSourceUploadResult, Z3ChatProjectSourceError>;
    readonly remove: (
      input: Z3ChatProjectSourceDeleteInput,
    ) => Effect.Effect<Z3ChatProjectSourceDeleteResult, Z3ChatProjectSourceError>;
  }
>()("t3/z3chatProjectSources/Z3ChatProjectSourceService") {}

export const layer = Layer.effect(Z3ChatProjectSourceService, make);
