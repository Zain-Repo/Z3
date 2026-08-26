import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("039_ProjectionImageGenerations", (it) => {
  it.effect("creates durable generation and image asset projections", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 38 });
      yield* runMigrations({ toMigrationInclusive: 39 });

      const generationTables = yield* sql<{ readonly name: string }>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('projection_image_generations', 'projection_image_assets')
        ORDER BY name
      `;
      assert.deepEqual(
        generationTables.map((table) => table.name),
        ["projection_image_assets", "projection_image_generations"],
      );

      const foreignKeys = yield* sql<{ readonly table: string; readonly on_delete: string }>`
        PRAGMA foreign_key_list(projection_image_assets)
      `;
      assert.equal(foreignKeys[0]?.table, "projection_image_generations");
      assert.equal(foreignKeys[0]?.on_delete, "CASCADE");
    }),
  );
});
