import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE chat_library_uploads (
    upload_id TEXT PRIMARY KEY,
    attachment_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  )`;
  yield* sql`CREATE INDEX idx_chat_library_uploads_created
    ON chat_library_uploads(created_at DESC, upload_id DESC)`;
  yield* sql`CREATE UNIQUE INDEX idx_chat_library_uploads_attachment
    ON chat_library_uploads(json_extract(attachment_json, '$.id'))`;
});
