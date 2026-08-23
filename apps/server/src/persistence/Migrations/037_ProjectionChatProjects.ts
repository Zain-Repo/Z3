import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_chat_projects (
      chat_project_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_chat_projects_updated_at
    ON projection_chat_projects(updated_at, chat_project_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_chat_projects_deleted_updated
    ON projection_chat_projects(deleted_at, updated_at, chat_project_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_chat_project_sources (
      source_id TEXT PRIMARY KEY,
      chat_project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
      contents TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chat_project_id)
        REFERENCES projection_chat_projects(chat_project_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_chat_project_sources_project_created
    ON projection_chat_project_sources(chat_project_id, created_at, source_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_chat_project_threads (
      chat_project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (chat_project_id, thread_id),
      FOREIGN KEY (chat_project_id)
        REFERENCES projection_chat_projects(chat_project_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_chat_project_threads_thread
    ON projection_chat_project_threads(thread_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_chat_project_threads_project_added
    ON projection_chat_project_threads(chat_project_id, added_at, thread_id)
  `;
});
