import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("037_ProjectionChatProjects", (it) => {
  it.effect("creates the Z3Chat project projection schema", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* sql`PRAGMA foreign_keys = ON;`;
      yield* runMigrations({ toMigrationInclusive: 36 });
      yield* runMigrations({ toMigrationInclusive: 37 });

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_chat_projects)
      `;
      assert.deepStrictEqual(
        columns.map((column) => column.name),
        ["chat_project_id", "name", "instructions", "created_at", "updated_at", "deleted_at"],
      );
      assert.strictEqual(columns.find((column) => column.name === "name")?.notnull, 1);
      assert.strictEqual(columns.find((column) => column.name === "instructions")?.notnull, 1);

      yield* sql`
        INSERT INTO projection_chat_projects (
          chat_project_id,
          name,
          instructions,
          created_at,
          updated_at
        ) VALUES (
          'chat-project-1',
          'Launch plan',
          'Prefer concise checklists.',
          '2026-08-23T00:00:00.000Z',
          '2026-08-23T00:00:00.000Z'
        )
      `;

      yield* sql`
        INSERT INTO projection_chat_project_sources (
          source_id,
          chat_project_id,
          name,
          mime_type,
          size_bytes,
          contents,
          created_at
        ) VALUES (
          'source-1',
          'chat-project-1',
          'brief.md',
          'text/markdown',
          12,
          'The launch is scheduled for October.',
          '2026-08-23T00:00:01.000Z'
        )
      `;

      yield* sql`
        INSERT INTO projection_chat_project_threads (
          chat_project_id,
          thread_id,
          added_at
        ) VALUES (
          'chat-project-1',
          'thread-1',
          '2026-08-23T00:00:02.000Z'
        )
      `;

      const rows = yield* sql<{
        readonly name: string;
        readonly instructions: string;
        readonly deletedAt: string | null;
      }>`
        SELECT
          name,
          instructions,
          deleted_at AS "deletedAt"
        FROM projection_chat_projects
        WHERE chat_project_id = 'chat-project-1'
      `;
      assert.deepStrictEqual(rows, [
        {
          name: "Launch plan",
          instructions: "Prefer concise checklists.",
          deletedAt: null,
        },
      ]);

      const sourceRows = yield* sql<{
        readonly sourceId: string;
        readonly projectId: string;
        readonly name: string;
        readonly contents: string;
      }>`
        SELECT
          source_id AS "sourceId",
          chat_project_id AS "projectId",
          name,
          contents
        FROM projection_chat_project_sources
        WHERE chat_project_id = 'chat-project-1'
      `;
      assert.deepStrictEqual(sourceRows, [
        {
          sourceId: "source-1",
          projectId: "chat-project-1",
          name: "brief.md",
          contents: "The launch is scheduled for October.",
        },
      ]);

      const threadRows = yield* sql<{
        readonly projectId: string;
        readonly threadId: string;
      }>`
        SELECT
          chat_project_id AS "projectId",
          thread_id AS "threadId"
        FROM projection_chat_project_threads
        WHERE chat_project_id = 'chat-project-1'
      `;
      assert.deepStrictEqual(threadRows, [{ projectId: "chat-project-1", threadId: "thread-1" }]);

      const projectIndexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(projection_chat_projects)
      `;
      const projectIndexNames = new Set(projectIndexes.map((index) => index.name));
      assert.ok(projectIndexNames.has("idx_projection_chat_projects_updated_at"));
      assert.ok(projectIndexNames.has("idx_projection_chat_projects_deleted_updated"));

      const sourceIndexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(projection_chat_project_sources)
      `;
      assert.ok(
        new Set(sourceIndexes.map((index) => index.name)).has(
          "idx_projection_chat_project_sources_project_created",
        ),
      );

      const threadIndexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(projection_chat_project_threads)
      `;
      const threadIndexNames = new Set(threadIndexes.map((index) => index.name));
      assert.ok(threadIndexNames.has("idx_projection_chat_project_threads_thread"));
      assert.ok(threadIndexNames.has("idx_projection_chat_project_threads_project_added"));

      const rejectsInvalidSize = yield* sql`
        INSERT INTO projection_chat_project_sources (
          source_id,
          chat_project_id,
          name,
          mime_type,
          size_bytes,
          contents,
          created_at
        ) VALUES (
          'source-invalid-size',
          'chat-project-1',
          'invalid.txt',
          'text/plain',
          -1,
          'invalid',
          '2026-08-23T00:00:03.000Z'
        )
      `.pipe(
        Effect.as(false),
        Effect.orElseSucceed(() => true),
      );
      assert.strictEqual(rejectsInvalidSize, true);

      yield* sql`
        DELETE FROM projection_chat_projects
        WHERE chat_project_id = 'chat-project-1'
      `;
      const childRows = yield* sql<{ readonly rowCount: number }>`
        SELECT COUNT(*) AS "rowCount"
        FROM projection_chat_project_sources
        WHERE chat_project_id = 'chat-project-1'
      `;
      const membershipRows = yield* sql<{ readonly rowCount: number }>`
        SELECT COUNT(*) AS "rowCount"
        FROM projection_chat_project_threads
        WHERE chat_project_id = 'chat-project-1'
      `;
      assert.strictEqual(childRows[0]?.rowCount, 0);
      assert.strictEqual(membershipRows[0]?.rowCount, 0);
    }),
  );
});
