import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("036_ProjectionThreadScope", (it) => {
  it.effect("preserves existing threads as project-scoped and allows projectless chats", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 35 });
      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          created_at,
          updated_at,
          pending_approval_count,
          pending_user_input_count,
          has_actionable_proposed_plan
        ) VALUES (
          'legacy-thread',
          'project-legacy',
          'Legacy thread',
          '{"instanceId":"codex","model":"gpt-5.4"}',
          'full-access',
          'default',
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
          0,
          0,
          0
        )
      `;
      yield* sql`
        INSERT INTO projection_thread_messages (
          message_id,
          thread_id,
          turn_id,
          role,
          text,
          is_streaming,
          created_at,
          updated_at
        ) VALUES (
          'legacy-message',
          'legacy-thread',
          'legacy-turn',
          'user',
          'Preserve this message',
          0,
          '2026-01-01T00:00:01.000Z',
          '2026-01-01T00:00:01.000Z'
        )
      `;
      yield* sql`
        INSERT INTO projection_thread_activities (
          activity_id,
          thread_id,
          turn_id,
          tone,
          kind,
          summary,
          payload_json,
          created_at
        ) VALUES (
          'legacy-activity',
          'legacy-thread',
          'legacy-turn',
          'info',
          'runtime.note',
          'Preserve this activity',
          '{}',
          '2026-01-01T00:00:02.000Z'
        )
      `;
      yield* sql`
        INSERT INTO projection_thread_sessions (
          thread_id,
          status,
          updated_at
        ) VALUES (
          'legacy-thread',
          'idle',
          '2026-01-01T00:00:03.000Z'
        )
      `;
      yield* sql`
        INSERT INTO projection_turns (
          thread_id,
          turn_id,
          state,
          requested_at,
          checkpoint_files_json
        ) VALUES (
          'legacy-thread',
          'legacy-turn',
          'completed',
          '2026-01-01T00:00:04.000Z',
          '[]'
        )
      `;
      yield* sql`
        INSERT INTO projection_pending_approvals (
          request_id,
          thread_id,
          turn_id,
          status,
          created_at
        ) VALUES (
          'legacy-approval',
          'legacy-thread',
          'legacy-turn',
          'pending',
          '2026-01-01T00:00:05.000Z'
        )
      `;
      yield* sql`
        INSERT INTO projection_thread_proposed_plans (
          plan_id,
          thread_id,
          turn_id,
          plan_markdown,
          created_at,
          updated_at
        ) VALUES (
          'legacy-plan',
          'legacy-thread',
          'legacy-turn',
          '# Preserve this plan',
          '2026-01-01T00:00:06.000Z',
          '2026-01-01T00:00:06.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 36 });

      const legacyRows = yield* sql<{
        readonly scope: string;
        readonly projectId: string | null;
        readonly title: string;
      }>`
        SELECT
          scope,
          project_id AS "projectId",
          title
        FROM projection_threads
        WHERE thread_id = 'legacy-thread'
      `;
      assert.deepStrictEqual(legacyRows, [
        { scope: "project", projectId: "project-legacy", title: "Legacy thread" },
      ]);

      const childCounts = yield* sql<{
        readonly tableName: string;
        readonly rowCount: number;
      }>`
        SELECT 'messages' AS "tableName", COUNT(*) AS "rowCount"
        FROM projection_thread_messages
        WHERE thread_id = 'legacy-thread'
        UNION ALL
        SELECT 'activities' AS "tableName", COUNT(*) AS "rowCount"
        FROM projection_thread_activities
        WHERE thread_id = 'legacy-thread'
        UNION ALL
        SELECT 'sessions' AS "tableName", COUNT(*) AS "rowCount"
        FROM projection_thread_sessions
        WHERE thread_id = 'legacy-thread'
        UNION ALL
        SELECT 'turns' AS "tableName", COUNT(*) AS "rowCount"
        FROM projection_turns
        WHERE thread_id = 'legacy-thread'
        UNION ALL
        SELECT 'approvals' AS "tableName", COUNT(*) AS "rowCount"
        FROM projection_pending_approvals
        WHERE thread_id = 'legacy-thread'
        UNION ALL
        SELECT 'plans' AS "tableName", COUNT(*) AS "rowCount"
        FROM projection_thread_proposed_plans
        WHERE thread_id = 'legacy-thread'
      `;
      assert.deepStrictEqual(childCounts, [
        { tableName: "messages", rowCount: 1 },
        { tableName: "activities", rowCount: 1 },
        { tableName: "sessions", rowCount: 1 },
        { tableName: "turns", rowCount: 1 },
        { tableName: "approvals", rowCount: 1 },
        { tableName: "plans", rowCount: 1 },
      ]);

      const indexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(projection_threads)
      `;
      const indexNames = new Set(indexes.map((index) => index.name));
      assert.ok(indexNames.has("idx_projection_threads_project_id"));
      assert.ok(indexNames.has("idx_projection_threads_project_archived_at"));
      assert.ok(indexNames.has("idx_projection_threads_project_deleted_created"));
      assert.ok(indexNames.has("idx_projection_threads_shell_active"));
      assert.ok(indexNames.has("idx_projection_threads_shell_archived"));
      assert.ok(indexNames.has("idx_projection_threads_scope_deleted_created"));

      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          scope,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          created_at,
          updated_at
        ) VALUES (
          'chat-thread',
          'chat',
          NULL,
          'Projectless chat',
          '{"instanceId":"codex","model":"gpt-5.4"}',
          'full-access',
          'default',
          '2026-01-02T00:00:00.000Z',
          '2026-01-02T00:00:00.000Z'
        )
      `;

      const chatRows = yield* sql<{
        readonly scope: string;
        readonly projectId: string | null;
      }>`
        SELECT scope, project_id AS "projectId"
        FROM projection_threads
        WHERE thread_id = 'chat-thread'
      `;
      assert.deepStrictEqual(chatRows, [{ scope: "chat", projectId: null }]);

      const rejectsInvalidProjectScope = yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          scope,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          created_at,
          updated_at
        ) VALUES (
          'invalid-project-thread',
          'project',
          NULL,
          'Invalid project thread',
          '{"instanceId":"codex","model":"gpt-5.4"}',
          'full-access',
          'default',
          '2026-01-03T00:00:00.000Z',
          '2026-01-03T00:00:00.000Z'
        )
      `.pipe(
        Effect.as(false),
        Effect.orElseSucceed(() => true),
      );
      assert.strictEqual(rejectsInvalidProjectScope, true);
    }),
  );
});
