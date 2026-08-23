import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (columns.some((column) => column.name === "scope")) {
    return;
  }

  yield* sql`
    CREATE TABLE projection_threads_next (
      thread_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'project'
        CHECK (scope IN ('project', 'chat')),
      project_id TEXT,
      title TEXT NOT NULL,
      model_selection_json TEXT,
      runtime_mode TEXT NOT NULL DEFAULT 'full-access',
      interaction_mode TEXT NOT NULL DEFAULT 'default',
      branch TEXT,
      worktree_path TEXT,
      latest_turn_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      settled_override TEXT,
      settled_at TEXT,
      snoozed_until TEXT,
      snoozed_at TEXT,
      title_regeneration_request_id TEXT,
      title_regeneration_started_at TEXT,
      latest_user_message_at TEXT,
      pending_approval_count INTEGER NOT NULL DEFAULT 0,
      pending_user_input_count INTEGER NOT NULL DEFAULT 0,
      has_actionable_proposed_plan INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      CHECK (
        (scope = 'project' AND project_id IS NOT NULL)
        OR (scope = 'chat' AND project_id IS NULL)
      )
    )
  `;

  yield* sql`
    INSERT INTO projection_threads_next (
      thread_id,
      scope,
      project_id,
      title,
      model_selection_json,
      runtime_mode,
      interaction_mode,
      branch,
      worktree_path,
      latest_turn_id,
      created_at,
      updated_at,
      archived_at,
      settled_override,
      settled_at,
      snoozed_until,
      snoozed_at,
      title_regeneration_request_id,
      title_regeneration_started_at,
      latest_user_message_at,
      pending_approval_count,
      pending_user_input_count,
      has_actionable_proposed_plan,
      deleted_at
    )
    SELECT
      thread_id,
      'project',
      project_id,
      title,
      model_selection_json,
      runtime_mode,
      interaction_mode,
      branch,
      worktree_path,
      latest_turn_id,
      created_at,
      updated_at,
      archived_at,
      settled_override,
      settled_at,
      snoozed_until,
      snoozed_at,
      title_regeneration_request_id,
      title_regeneration_started_at,
      latest_user_message_at,
      pending_approval_count,
      pending_user_input_count,
      has_actionable_proposed_plan,
      deleted_at
    FROM projection_threads
  `;

  yield* sql`DROP TABLE projection_threads`;
  yield* sql`ALTER TABLE projection_threads_next RENAME TO projection_threads`;

  yield* sql`
    CREATE INDEX idx_projection_threads_project_id
    ON projection_threads(project_id)
  `;
  yield* sql`
    CREATE INDEX idx_projection_threads_project_archived_at
    ON projection_threads(project_id, archived_at)
  `;
  yield* sql`
    CREATE INDEX idx_projection_threads_project_deleted_created
    ON projection_threads(project_id, deleted_at, created_at)
  `;
  yield* sql`
    CREATE INDEX idx_projection_threads_shell_active
    ON projection_threads(deleted_at, archived_at, scope, project_id, created_at, thread_id)
  `;
  yield* sql`
    CREATE INDEX idx_projection_threads_shell_archived
    ON projection_threads(deleted_at, archived_at, scope, project_id, thread_id)
  `;
  yield* sql`
    CREATE INDEX idx_projection_threads_scope_deleted_created
    ON projection_threads(scope, deleted_at, created_at, thread_id)
  `;
});
