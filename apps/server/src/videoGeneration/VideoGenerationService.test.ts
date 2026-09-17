import { assert, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { FAL_VIDEO_MODELS } from "../mediaGeneration/FalModels.ts";
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
                    new Response("download unavailable", { status: 400 }),
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
    ServerSettingsService.layerTest({
      providers: { openrouter: { apiKey: "test-key" } },
      providerInstances: {
        [ProviderInstanceId.make("fal")]: {
          driver: ProviderDriverKind.make("fal"),
          enabled: true,
          environment: [{ name: "FAL_KEY", value: "fal-test-key", sensitive: true }],
        },
      },
    }),
  ),
);

layer("VideoGenerationService", (it) => {
  it.effect(
    "recovers a fal video using its persisted status URL and stores the output locally",
    () =>
      Effect.gen(function* () {
        yield* runMigrations({ toMigrationInclusive: 40 });
        const sql = yield* SqlClient.SqlClient;
        const downloaded = yield* Deferred.make<void>();
        const queue = "https://queue.fal.run/wan/v2.6/requests/recovered-fal";
        yield* sql`INSERT INTO projection_video_generations
      (generation_id, provider_job_id, provider_instance_id, model, status, polling_url, created_at, updated_at)
      VALUES ('fal-recovery', 'recovered-fal', 'fal', 'fal/wan-2.6-image-to-video', 'pending', ${`${queue}/status`}, '2026-01-01', '2026-01-01')`;
        const urls: string[] = [];
        const client = HttpClient.make((request) => {
          urls.push(request.url);
          if (request.url === `${queue}/status`)
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                Response.json({ status: "COMPLETED", response_url: `${queue}/result` }),
              ),
            );
          if (request.url === `${queue}/result`)
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                Response.json({ video: { url: "https://v3.fal.media/movie.mp4" } }),
              ),
            );
          assert.equal(request.headers.authorization, undefined);
          return Deferred.succeed(downloaded, undefined).pipe(
            Effect.as(
              HttpClientResponse.fromWeb(
                request,
                new Response(new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109])),
              ),
            ),
          );
        });
        yield* Effect.scoped(Layer.build(VideoGenerationService.layer)).pipe(
          Effect.provide(Layer.succeed(HttpClient.HttpClient, client)),
        );
        yield* Deferred.await(downloaded);
        yield* Effect.yieldNow;
        const assets = yield* sql<{
          readonly size: number;
        }>`SELECT length(bytes) AS size FROM projection_video_assets WHERE generation_id = 'fal-recovery'`;
        assert.equal(assets[0]?.size, 12);
        assert.deepEqual(urls, [
          `${queue}/status`,
          `${queue}/result`,
          "https://v3.fal.media/movie.mp4",
        ]);
      }),
  );
  const withService = <A, E>(client: HttpClient.HttpClient, effect: Effect.Effect<A, E>) =>
    effect.pipe(
      Effect.provide(
        VideoGenerationService.layer.pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
        ),
      ),
    );

  it.effect("lists fal models and submits Wan jobs without OpenRouter", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 40 });
      const downloaded = yield* Deferred.make<void>();
      const queue = "https://queue.fal.run/wan/v2.6/requests/fal-video";
      const urls: string[] = [];
      const client = HttpClient.make((request) => {
        urls.push(`${request.method} ${request.url}`);
        if (request.method === "POST") {
          assert.equal(request.url, "https://queue.fal.run/wan/v2.6/text-to-video");
          assert.equal(request.headers.authorization, "Key fal-test-key");
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({
                request_id: "fal-video",
                status_url: `${queue}/status`,
                response_url: `${queue}/result`,
                cancel_url: `${queue}/cancel`,
              }),
            ),
          );
        }
        if (request.url === `${queue}/status`)
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ status: "COMPLETED", response_url: `${queue}/result` }),
            ),
          );
        if (request.url === `${queue}/result`)
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ video: { url: "https://v3.fal.media/clip.mp4" } }),
            ),
          );
        assert.equal(request.headers.authorization, undefined);
        return Deferred.succeed(downloaded, undefined).pipe(
          Effect.as(
            HttpClientResponse.fromWeb(
              request,
              new Response(new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109])),
            ),
          ),
        );
      });
      const record = yield* withService(
        client,
        Effect.gen(function* () {
          const service = yield* VideoGenerationService.VideoGenerationService;
          const models = yield* service.listModels(ProviderInstanceId.make("fal"));
          assert.equal(models.length, FAL_VIDEO_MODELS.length);
          return yield* service.generate({
            model: "fal/wan-2.6-text-to-video",
            providerInstanceId: ProviderInstanceId.make("fal"),
            prompt: "A scene",
            duration: 5,
          });
        }),
      );
      assert.equal(record.status, "pending");
      yield* Deferred.await(downloaded);
      yield* Effect.yieldNow;
      const sql = yield* SqlClient.SqlClient;
      const assets = yield* sql<{
        readonly size: number;
      }>`SELECT length(bytes) AS size FROM projection_video_assets WHERE generation_id = ${record.id}`;
      assert.equal(assets[0]?.size, 12);
      assert.ok(urls.every((url) => !url.includes("openrouter")));
    }),
  );

  it.effect("surfaces fal generation errors instead of a generic failure", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 40 });
      const client = HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 401 }))),
      );
      const result = yield* withService(
        client,
        Effect.gen(function* () {
          const service = yield* VideoGenerationService.VideoGenerationService;
          return yield* service
            .generate({
              model: "fal/wan-2.6-text-to-video",
              prompt: "A scene",
            })
            .pipe(Effect.flip);
        }),
      );
      assert.include(result.message, "API key");
    }),
  );

  it.effect("rejects incompatible model options before submitting a paid request", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 40 });
      let submissions = 0;
      const client = HttpClient.make((request) => {
        if (request.method === "POST") submissions++;
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({
              data: [
                {
                  id: "test/video",
                  supported_durations: [5],
                  supported_resolutions: ["720p"],
                },
              ],
            }),
          ),
        );
      });
      const result = yield* withService(
        client,
        Effect.gen(function* () {
          const service = yield* VideoGenerationService.VideoGenerationService;
          return yield* service
            .generate({ model: "test/video", prompt: "A scene", duration: 99 })
            .pipe(Effect.flip);
        }),
      );
      assert.include(result.message, "Duration");
      assert.equal(submissions, 0);
    }),
  );

  it.effect("preserves submission errors and never retries a paid POST", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 40 });
      let submissions = 0;
      const client = HttpClient.make((request) => {
        if (request.method === "POST") submissions++;
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            request.method === "POST"
              ? Response.json(
                  { error: { message: "Provider temporarily unavailable" } },
                  { status: 503 },
                )
              : Response.json({ data: [{ id: "test/video" }] }),
          ),
        );
      });
      const result = yield* withService(
        client,
        Effect.gen(function* () {
          const service = yield* VideoGenerationService.VideoGenerationService;
          return yield* service
            .generate({ model: "test/video", prompt: "A scene" })
            .pipe(Effect.flip);
        }),
      );
      assert.include(result.message, "Provider temporarily unavailable");
      assert.equal(submissions, 1);
    }),
  );

  it.effect(
    "retries a transient content failure and saves the completed video without another POST",
    () =>
      Effect.gen(function* () {
        yield* runMigrations({ toMigrationInclusive: 40 });
        const firstDownload = yield* Deferred.make<void>();
        let downloads = 0;
        let submissions = 0;
        const client = HttpClient.make((request) => {
          if (request.url.includes("/content")) {
            downloads++;
            if (downloads === 1)
              return Deferred.succeed(firstDownload, undefined).pipe(
                Effect.as(
                  HttpClientResponse.fromWeb(request, new Response("try again", { status: 503 })),
                ),
              );
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                new Response(new Uint8Array([1, 2, 3]), {
                  headers: { "content-type": "video/mp4" },
                }),
              ),
            );
          }
          if (request.method === "POST") submissions++;
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json(
                request.method === "POST"
                  ? { id: "retry-job", status: "completed" }
                  : { data: [{ id: "test/video" }] },
              ),
            ),
          );
        });
        const fiber = yield* withService(
          client,
          Effect.gen(function* () {
            const service = yield* VideoGenerationService.VideoGenerationService;
            return yield* service.generate({ model: "test/video", prompt: "A scene" });
          }),
        ).pipe(Effect.forkChild);
        yield* Deferred.await(firstDownload);
        yield* TestClock.adjust("2 seconds");
        const result = yield* Fiber.join(fiber);
        assert.equal(result.status, "completed");
        assert.equal(result.assets.length, 1);
        assert.equal(result.assets[0]?.sizeBytes, 3);
        assert.equal(submissions, 1);
        assert.equal(downloads, 2);
      }),
  );

  it.effect("does not re-poll fully downloaded videos on startup", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 40 });
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        INSERT INTO projection_video_generations
          (generation_id, provider_job_id, model, status, created_at, updated_at)
        VALUES ('saved-generation', 'saved-job', 'test/video', 'completed', '2026-01-01', '2026-01-01')
      `;
      yield* sql`
        INSERT INTO projection_video_assets (asset_id, generation_id, media_type, bytes, created_at)
        VALUES ('saved-asset', 'saved-generation', 'video/mp4', X'010203', '2026-01-01')
      `;
      let calls = 0;
      const client = HttpClient.make((request) => {
        calls++;
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response("expired", { status: 404 })),
        );
      });
      yield* withService(
        client,
        Effect.gen(function* () {
          const service = yield* VideoGenerationService.VideoGenerationService;
          const result = yield* service.listGenerations();
          assert.ok(result.generations.every((generation) => generation.status === "completed"));
        }),
      );
      assert.equal(calls, 0);
    }),
  );

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
          (generation_id, provider_job_id, model, status, created_at, updated_at, completed_at, unsigned_urls_json)
        VALUES ('generation-1', 'job-1', 'google/veo-3.1', 'completed', '2026-01-01', '2026-01-01', '2026-01-01', '["output-0", "output-1"]')
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
