import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS projection_conversation_memory_fts USING fts5(
      message_id UNINDEXED,
      thread_id UNINDEXED,
      created_at UNINDEXED,
      text,
      tokenize = 'porter unicode61 remove_diacritics 2'
    )
  `;

  // Only completed user messages are useful retrieval anchors. The associated
  // canonical assistant response is resolved from projection_turns at query time.
  yield* sql`
    INSERT INTO projection_conversation_memory_fts (message_id, thread_id, created_at, text)
    SELECT message_id, thread_id, created_at, text
    FROM projection_thread_messages
    WHERE role = 'user'
      AND is_streaming = 0
      AND NOT EXISTS (
        SELECT 1
        FROM projection_conversation_memory_fts AS memory
        WHERE memory.message_id = projection_thread_messages.message_id
      )
  `;

  yield* sql`
    CREATE TRIGGER IF NOT EXISTS projection_conversation_memory_fts_insert
    AFTER INSERT ON projection_thread_messages
    WHEN NEW.role = 'user' AND NEW.is_streaming = 0
    BEGIN
      INSERT INTO projection_conversation_memory_fts (message_id, thread_id, created_at, text)
      VALUES (NEW.message_id, NEW.thread_id, NEW.created_at, NEW.text);
    END
  `;

  yield* sql`
    CREATE TRIGGER IF NOT EXISTS projection_conversation_memory_fts_delete
    AFTER DELETE ON projection_thread_messages
    BEGIN
      DELETE FROM projection_conversation_memory_fts WHERE message_id = OLD.message_id;
    END
  `;

  yield* sql`
    CREATE TRIGGER IF NOT EXISTS projection_conversation_memory_fts_update
    AFTER UPDATE OF message_id, thread_id, role, text, is_streaming, created_at
    ON projection_thread_messages
    BEGIN
      DELETE FROM projection_conversation_memory_fts WHERE message_id = OLD.message_id;
      INSERT INTO projection_conversation_memory_fts (message_id, thread_id, created_at, text)
      SELECT NEW.message_id, NEW.thread_id, NEW.created_at, NEW.text
      WHERE NEW.role = 'user' AND NEW.is_streaming = 0;
    END
  `;
});
