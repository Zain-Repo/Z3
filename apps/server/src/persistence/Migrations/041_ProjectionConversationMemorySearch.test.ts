import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

const insertMessage = (input: {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly streaming?: 0 | 1;
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO projection_thread_messages (
        message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at
      ) VALUES (
        ${input.id},
        'thread-1',
        'turn-1',
        ${input.role},
        ${input.text},
        ${input.streaming ?? 0},
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z'
      )
    `;
  });

layer("041_ProjectionConversationMemorySearch", (it) => {
  it.effect("backfills and maintains the user-message full-text index", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 40 });
      yield* insertMessage({
        id: "backfilled-user",
        role: "user",
        text: "How can I improve durable conversation recall?",
      });
      yield* runMigrations({ toMigrationInclusive: 41 });

      const backfilled = yield* sql<{ readonly messageId: string }>`
        SELECT message_id AS "messageId"
        FROM projection_conversation_memory_fts
        WHERE projection_conversation_memory_fts MATCH 'conversation recall'
      `;
      assert.deepEqual(backfilled.map((row) => row.messageId), ["backfilled-user"]);

      yield* insertMessage({
        id: "ignored-assistant",
        role: "assistant",
        text: "Use a searchable index.",
      });
      yield* insertMessage({
        id: "inserted-user",
        role: "user",
        text: "Where is the semantic memory index?",
      });
      const inserted = yield* sql<{ readonly messageId: string }>`
        SELECT message_id AS "messageId"
        FROM projection_conversation_memory_fts
        WHERE projection_conversation_memory_fts MATCH 'semantic memory'
      `;
      assert.deepEqual(inserted.map((row) => row.messageId), ["inserted-user"]);

      yield* sql`
        UPDATE projection_thread_messages
        SET text = 'Where is the historical context index?'
        WHERE message_id = 'inserted-user'
      `;
      const stale = yield* sql`
        SELECT message_id
        FROM projection_conversation_memory_fts
        WHERE projection_conversation_memory_fts MATCH 'semantic'
      `;
      const updated = yield* sql<{ readonly messageId: string }>`
        SELECT message_id AS "messageId"
        FROM projection_conversation_memory_fts
        WHERE projection_conversation_memory_fts MATCH 'historical context'
      `;
      assert.equal(stale.length, 0);
      assert.deepEqual(updated.map((row) => row.messageId), ["inserted-user"]);

      yield* sql`DELETE FROM projection_thread_messages WHERE message_id = 'inserted-user'`;
      const deleted = yield* sql`
        SELECT message_id
        FROM projection_conversation_memory_fts
        WHERE projection_conversation_memory_fts MATCH 'historical'
      `;
      assert.equal(deleted.length, 0);
    }),
  );
});
