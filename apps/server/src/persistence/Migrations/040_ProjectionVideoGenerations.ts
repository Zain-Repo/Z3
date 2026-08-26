import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_video_generations (
      generation_id TEXT PRIMARY KEY,
      provider_job_id TEXT NOT NULL UNIQUE,
      provider_instance_id TEXT,
      model TEXT NOT NULL,
      prompt TEXT,
      status TEXT NOT NULL,
      polling_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT,
      usage_json TEXT,
      unsigned_urls_json TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_video_generations_created
    ON projection_video_generations(created_at DESC, generation_id DESC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_video_generations_status
    ON projection_video_generations(status, updated_at)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_video_assets (
      asset_id TEXT PRIMARY KEY,
      generation_id TEXT NOT NULL,
      media_type TEXT NOT NULL,
      bytes BLOB NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (generation_id)
        REFERENCES projection_video_generations(generation_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_video_assets_generation
    ON projection_video_assets(generation_id, created_at, asset_id)
  `;
});

