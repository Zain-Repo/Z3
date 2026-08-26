import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("040_ProjectionVideoGenerations", (it) => {
  it.effect("creates video job and asset storage with cascading cleanup", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 40 });
      yield* sql`
        INSERT INTO projection_video_generations
          (generation_id, provider_job_id, model, status, created_at, updated_at)
        VALUES ('generation-1', 'job-1', 'google/veo-3.1', 'pending', '2026-01-01', '2026-01-01')
      `;
      yield* sql`
        INSERT INTO projection_video_assets
          (asset_id, generation_id, media_type, bytes, created_at)
        VALUES ('asset-1', 'generation-1', 'video/mp4', X'0001', '2026-01-01')
      `;
      const tables = yield* sql<{ readonly name: string }>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('projection_video_generations', 'projection_video_assets')
        ORDER BY name
      `;
      assert.deepEqual(
        tables.map((table) => table.name),
        ["projection_video_assets", "projection_video_generations"],
      );
      yield* sql`DELETE FROM projection_video_generations WHERE generation_id = 'generation-1'`;
      const assets = yield* sql`SELECT asset_id FROM projection_video_assets`;
      assert.equal(assets.length, 0);
    }),
  );
});
