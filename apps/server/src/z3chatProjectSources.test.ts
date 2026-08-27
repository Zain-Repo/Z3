import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import * as ServerSettings from "./serverSettings.ts";
import * as Z3ChatProjectSources from "./z3chatProjectSources.ts";

const makeHttpClientLayer = (responses: readonly Response[]) => {
  const requests: Array<Parameters<typeof HttpClientResponse.fromWeb>[0]> = [];
  let responseIndex = 0;
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      requests.push(request);
      const response = responses[responseIndex++];
      if (!response) throw new Error("Unexpected OpenRouter request in test.");
      return HttpClientResponse.fromWeb(request, response);
    }),
  );

  return {
    layer: Layer.succeed(HttpClient.HttpClient, client),
    requests,
  };
};

const makeSettingsLayer = (apiKey = "sk-or-test") =>
  ServerSettings.ServerSettingsService.layerTest({
    providers: {
      openrouter: {
        apiEndpoint: "https://openrouter.test/api/v1",
        apiKey,
      },
    },
  });

const uploadInput = {
  projectId: "project-1",
  sourceId: "source-1",
  projectName: "Project one",
  fileName: "notes.txt",
  mimeType: "text/plain",
  contentBase64: "aGVsbG8=",
  embeddingModel: "openai/text-embedding-3-small",
} as const;

const embeddingResponse = (embedding: readonly number[] = [0.1, 0.2, 0.3]) =>
  Response.json({
    data: [{ embedding, index: 0 }],
    model: "openai/text-embedding-3-small",
    object: "list",
  });

it.effect("embeds a source through OpenRouter and stores the index in memory", () => {
  const http = makeHttpClientLayer([embeddingResponse()]);

  return Effect.gen(function* () {
    const service = yield* Z3ChatProjectSources.Z3ChatProjectSourceService;
    const result = yield* service.uploadAndIndex(uploadInput);

    assert.deepStrictEqual(result, {
      sourceId: "source-1",
      embeddingModel: "openai/text-embedding-3-small",
      embeddingDimensions: 3,
      chunkCount: 1,
      indexedAt: result.indexedAt,
      status: "completed",
    });
    assert.strictEqual(http.requests[0]?.method, "POST");
    assert.strictEqual(
      http.requests[0]?.url,
      "https://openrouter.test/api/v1/embeddings",
    );
    assert.strictEqual(http.requests[0]?.headers.authorization, "Bearer sk-or-test");
    const body = http.requests[0]!.body as { readonly body?: Uint8Array };
    assert.include(
      new TextDecoder().decode(body.body ?? new Uint8Array()),
      "openai/text-embedding-3-small",
    );
  }).pipe(
    Effect.provide(
      Z3ChatProjectSources.layer.pipe(
        Layer.provide(Layer.merge(makeSettingsLayer(), http.layer)),
      ),
    ),
  );
});

it.effect("re-indexing replaces the in-memory entry for the same source", () => {
  const http = makeHttpClientLayer([
    embeddingResponse([0.1, 0.2]),
    embeddingResponse([0.4, 0.5]),
  ]);

  return Effect.gen(function* () {
    const service = yield* Z3ChatProjectSources.Z3ChatProjectSourceService;
    yield* service.uploadAndIndex({ ...uploadInput, embeddingModel: "model-a" });
    const result = yield* service.uploadAndIndex({ ...uploadInput, embeddingModel: "model-b" });

    assert.strictEqual(result.sourceId, "source-1");
    assert.strictEqual(result.embeddingModel, "model-b");
    assert.strictEqual(result.embeddingDimensions, 2);
    assert.strictEqual(http.requests.length, 2);
  }).pipe(
    Effect.provide(
      Z3ChatProjectSources.layer.pipe(
        Layer.provide(Layer.merge(makeSettingsLayer(), http.layer)),
      ),
    ),
  );
});

it.effect("deleting a source removes its in-memory index without another provider call", () => {
  const http = makeHttpClientLayer([embeddingResponse()]);

  return Effect.gen(function* () {
    const service = yield* Z3ChatProjectSources.Z3ChatProjectSourceService;
    yield* service.uploadAndIndex(uploadInput);
    assert.deepStrictEqual(
      yield* service.remove({ projectId: "project-1", sourceId: "source-1" }),
      { deleted: true },
    );
    assert.strictEqual(http.requests.length, 1);
  }).pipe(
    Effect.provide(
      Z3ChatProjectSources.layer.pipe(
        Layer.provide(Layer.merge(makeSettingsLayer(), http.layer)),
      ),
    ),
  );
});

it.effect("keeps the source local when OpenRouter is not configured", () => {
  const http = makeHttpClientLayer([]);

  return Effect.gen(function* () {
    const service = yield* Z3ChatProjectSources.Z3ChatProjectSourceService;
    const error = yield* service.uploadAndIndex(uploadInput).pipe(Effect.flip);
    assert.strictEqual(error.code, "not_configured");
    assert.strictEqual(http.requests.length, 0);
  }).pipe(
    Effect.provide(
      Z3ChatProjectSources.layer.pipe(
        Layer.provide(Layer.merge(makeSettingsLayer(""), http.layer)),
      ),
    ),
  );
});
