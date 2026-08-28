import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { runMigrations } from "../persistence/Migrations.ts";
import * as NodeSqliteClient from "../persistence/NodeSqliteClient.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import * as VideoGenerationService from "./VideoGenerationService.ts";

type VideoGenerationTestState = {
  readonly attempts: Ref.Ref<number>;
  readonly contentIndexes: Ref.Ref<ReadonlyArray<number>>;
  readonly failedDownload: Deferred.Deferred<void>;
  readonly recoveredDownload: Deferred.Deferred<void>;
};

const makeHttpClient = (state: VideoGenerationTestState) =>
  HttpClient.make((request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/videos/job-1")) {
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              id: "job-1",
              status: "completed",
              unsigned_urls: ["ignored-0", "ignored-1"],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      );
    }
    const index = Number(url.searchParams.get("index"));
    return Ref.updateAndGet(state.contentIndexes, (indexes) => [...indexes, index]).pipe(
      Effect.flatMap(() =>
        Ref.get(state.attempts).pipe(
          Effect.flatMap((attempt) => {
            if (index === 1 && attempt === 0) {
              return Deferred.succeed(state.failedDownload, undefined).pipe(
                Effect.as(
                  HttpClientResponse.fromWeb(
                    request,
                    new Response("temporary failure", { status: 503 }),
                  ),
                ),
              );
            }
            return Deferred.succeed(state.recoveredDownload, undefined).pipe(
              Effect.as(
                HttpClientResponse.fromWeb(
                  request,
                  new Response(new Uint8Array([index]), {
                    status: 200,
                    headers: { "content-type": "video/mp4" },
                  }),
                ),
              ),
            );
          }),
        ),
      ),
    );
  });

const layer = it.layer(
  Layer.mergeAll(
    NodeSqliteClient.layerMemory(),
    NodeServices.layer,
    ServerSettingsService.layerTest({ providers: { openrouter: { apiKey: "test-key" } } }),
  ),
);

layer("VideoGenerationService", (it) => {
  it.effect("resumes a partially persisted completed job after restart", () =>
    Effect.gen(function* () {
      const state: VideoGenerationTestState = {
        attempts: yield* Ref.make(0),
        contentIndexes: yield* Ref.make<ReadonlyArray<number>>([]),
        failedDownload: yield* Deferred.make<void>(),
        recoveredDownload: yield* Deferred.make<void>(),
      };
      const httpClient = makeHttpClient(state);
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 40 });
      yield* sql`
        INSERT INTO projection_video_generations
          (generation_id, provider_job_id, model, status, created_at, updated_at, completed_at)
        VALUES ('generation-1', 'job-1', 'google/veo-3.1', 'completed', '2026-01-01', '2026-01-01', '2026-01-01')
      `;
      yield* sql`
        INSERT INTO projection_video_assets
          (asset_id, generation_id, media_type, bytes, created_at)
        VALUES ('asset-0', 'generation-1', 'video/mp4', X'00', '2026-01-01')
      `;

      yield* Effect.scoped(Layer.build(VideoGenerationService.layer)).pipe(
        Effect.provide(Layer.succeed(HttpClient.HttpClient, httpClient)),
        Effect.asVoid,
      );
      yield* Deferred.await(state.failedDownload);
      yield* Effect.yieldNow;
      const afterFailure = yield* sql<{ readonly status: string; readonly error: string | null }>`
        SELECT status, error FROM projection_video_generations WHERE generation_id = 'generation-1'
      `;
      assert.equal(afterFailure[0]?.status, "completed");
      assert.ok(afterFailure[0]?.error);

      yield* Ref.set(state.attempts, 1);
      yield* Effect.scoped(Layer.build(VideoGenerationService.layer)).pipe(
        Effect.provide(Layer.succeed(HttpClient.HttpClient, httpClient)),
        Effect.asVoid,
      );
      yield* Deferred.await(state.recoveredDownload);
      yield* Effect.yieldNow;
      const assets = yield* sql<{ readonly asset_id: string }>`
        SELECT asset_id FROM projection_video_assets WHERE generation_id = 'generation-1' ORDER BY created_at, asset_id
      `;
      const generation = yield* sql<{ readonly status: string; readonly error: string | null }>`
        SELECT status, error FROM projection_video_generations WHERE generation_id = 'generation-1'
      `;
      assert.equal(assets.length, 2);
      assert.equal(generation[0]?.status, "completed");
      assert.equal(generation[0]?.error, null);
      assert.deepEqual(yield* Ref.get(state.contentIndexes), [1, 1]);
    }),
  );
});
