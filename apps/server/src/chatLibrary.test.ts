import { assert, it } from "vite-plus/test";
import { ChatAttachment, EnvironmentChatLibraryHttpApi } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { listChatLibrary } from "./chatLibrary.ts";
import { runMigrations } from "./persistence/Migrations.ts";
import * as NodeSqliteClient from "./persistence/NodeSqliteClient.ts";

const encodeAttachments = Schema.encodeEffect(Schema.fromJsonString(Schema.Array(ChatAttachment)));

it("decodes HTTP pagination strings and rejects unbounded requests", () => {
  const query = EnvironmentChatLibraryHttpApi.endpoints.list.query;
  assert.ok(query);
  const decode = Schema.decodeUnknownSync(Schema.make<Schema.Codec<unknown, unknown>>(query.ast));
  assert.deepEqual(decode({ limit: "20", offset: "2", category: "images" }), {
    limit: 20,
    offset: 2,
    category: "images",
  });
  for (const invalid of [{ limit: "101" }, { limit: "0" }, { offset: "-1" }, { limit: "1.5" }]) {
    assert.throws(() => decode(invalid));
  }
});

it("pages uploads with stable ordering and excludes deleted and project conversations", () =>
  Effect.gen(function* () {
    yield* runMigrations();
    const sql = yield* SqlClient.SqlClient;
    const createdAt = "2026-09-01T00:00:00.000Z";
    for (const thread of [
      { id: "chat", scope: "chat", deletedAt: null },
      { id: "deleted", scope: "chat", deletedAt: createdAt },
      { id: "project", scope: "project", deletedAt: null },
    ]) {
      yield* sql`INSERT INTO projection_threads
          (thread_id, scope, project_id, title, created_at, updated_at, deleted_at)
          VALUES (${thread.id}, ${thread.scope}, ${thread.scope === "project" ? "project-1" : null},
            'Conversation', ${createdAt}, ${createdAt}, ${thread.deletedAt})`;
      for (const role of ["user", "assistant"]) {
        yield* sql`INSERT INTO projection_thread_messages
            (message_id, thread_id, role, text, is_streaming, created_at, updated_at, attachments_json)
            VALUES (${`${thread.id}-${role}`}, ${thread.id}, ${role}, '', 0, ${createdAt}, ${createdAt},
              ${yield* encodeAttachments([
                {
                  id: "photo",
                  type: "image",
                  name: "Photo.png",
                  mimeType: "image/png",
                  sizeBytes: 10,
                },
                {
                  id: "report",
                  type: "file",
                  name: "Report.pdf",
                  mimeType: "application/pdf",
                  sizeBytes: 20,
                },
              ])})`;
      }
    }
    const first = yield* listChatLibrary({ limit: 1 });
    assert.deepEqual(
      first.items.map((item) => item.attachment.id),
      ["photo"],
    );
    assert.strictEqual(first.items[0]?.threadId, "chat");
    assert.strictEqual(first.nextOffset, 1);
    const second = yield* listChatLibrary({ limit: 1, offset: 1 });
    assert.deepEqual(
      second.items.map((item) => item.attachment.id),
      ["report"],
    );
    assert.strictEqual(second.nextOffset, null);
    assert.deepEqual(
      (yield* listChatLibrary({ category: "images" })).items.map((item) => item.attachment.id),
      ["photo"],
    );
    assert.deepEqual(
      (yield* listChatLibrary({ category: "files", query: "REPORT" })).items.map(
        (item) => item.attachment.id,
      ),
      ["report"],
    );
    assert.strictEqual((yield* listChatLibrary({ query: "%" })).items.length, 0);
    yield* sql`UPDATE projection_threads SET archived_at = ${createdAt} WHERE thread_id = 'chat'`;
    assert.strictEqual((yield* listChatLibrary({})).items.length, 2);
    yield* sql`INSERT INTO projection_thread_messages
      (message_id, thread_id, role, text, is_streaming, created_at, updated_at, attachments_json)
      SELECT 'chat-z', thread_id, role, text, is_streaming, created_at, updated_at, attachments_json
      FROM projection_thread_messages WHERE message_id = 'chat-user'`;
    assert.strictEqual((yield* listChatLibrary({ limit: 2 })).items[0]?.messageId, "chat-z");
    assert.strictEqual(
      (yield* listChatLibrary({ limit: 2, offset: 2 })).items[0]?.messageId,
      "chat-user",
    );
    yield* sql`DELETE FROM projection_thread_messages WHERE thread_id = 'chat'`;
    assert.deepEqual(yield* listChatLibrary({}), { items: [], nextOffset: null });
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory()), Effect.runPromise));
