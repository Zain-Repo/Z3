import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_image_generations (
      generation_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      usage_json TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_image_generations_created
    ON projection_image_generations(created_at DESC, generation_id DESC)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_image_assets (
      asset_id TEXT PRIMARY KEY,
      generation_id TEXT NOT NULL,
      media_type TEXT NOT NULL,
      bytes BLOB NOT NULL,
      revised_prompt TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (generation_id)
        REFERENCES projection_image_generations(generation_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_image_assets_generation
    ON projection_image_assets(generation_id, created_at, asset_id)
  `;
});
