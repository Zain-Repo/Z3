import {
  AuthOrchestrationReadScope,
  AuthOrchestrationOperateScope,
  ChatLibraryItem,
  type ChatLibraryQuery,
  EnvironmentHttpApi,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as FileSystem from "effect/FileSystem";
import { ServerConfig } from "./config.ts";
import { uploadChatLibrary, removeChatLibraryUpload } from "./chatLibraryUpload.ts";
import {
  annotateEnvironmentRequest,
  failEnvironmentInternal,
  requireEnvironmentScope,
} from "./auth/http.ts";

const decodeLibraryRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...ChatLibraryItem.fields,
      attachment: Schema.fromJsonString(ChatLibraryItem.fields.attachment),
    }),
  ),
);

/** Page individual uploads in SQL so opening the library never loads conversation bodies. */
export const listChatLibrary = Effect.fn("listChatLibrary")(function* (input: ChatLibraryQuery) {
  const sql = yield* SqlClient.SqlClient;
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 60;
  const query = input.query?.trim() ?? "";
  const category = input.category ?? "all";
  const rows = yield* sql`
    WITH uploads AS (
    SELECT attachment.value AS attachment,
      message.thread_id AS "threadId", thread.title AS "threadTitle",
      message.message_id AS "messageId", message.created_at AS "createdAt",
      message.message_id AS sort_id, attachment.key AS sort_index
    FROM projection_thread_messages AS message
    JOIN projection_threads AS thread ON thread.thread_id = message.thread_id
    JOIN json_each(COALESCE(message.attachments_json, '[]')) AS attachment
    WHERE thread.scope = 'chat' AND thread.deleted_at IS NULL AND message.role = 'user'
    UNION ALL
    SELECT attachment_json, NULL, NULL, NULL, created_at, upload_id, 0
    FROM chat_library_uploads
    WHERE deleted_at IS NULL
    )
    SELECT attachment, threadId, threadTitle, messageId, createdAt FROM uploads
    WHERE (${query} = '' OR instr(lower(json_extract(attachment, '$.name')), lower(${query})) > 0)
      AND (${category} = 'all'
        OR (${category} = 'images' AND json_extract(attachment, '$.type') = 'image')
        OR (${category} = 'files' AND json_extract(attachment, '$.type') = 'file'))
    ORDER BY createdAt DESC, sort_id DESC, sort_index ASC
    LIMIT ${limit + 1} OFFSET ${offset}
  `;
  const items = yield* decodeLibraryRows(rows.slice(0, limit));
  return { items, nextOffset: rows.length > limit ? offset + limit : null };
});

export const chatLibraryHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "chatLibrary",
  Effect.fnUntraced(function* (handlers) {
    const sql = yield* SqlClient.SqlClient;
    const fs = yield* FileSystem.FileSystem;
    const config = yield* ServerConfig;
    return handlers
      .handle(
        "list",
        Effect.fn("environment.chatLibrary.list")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* listChatLibrary(args.query).pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.catch(() => failEnvironmentInternal("internal_error")),
          );
        }),
      )
      .handle(
        "upload",
        Effect.fn("environment.chatLibrary.upload")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          return yield* uploadChatLibrary(args.payload, config.attachmentsDir).pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.catchTags({
              SqlError: () => failEnvironmentInternal("internal_error"),
              SchemaError: () => failEnvironmentInternal("internal_error"),
              PlatformError: () => failEnvironmentInternal("internal_error"),
            }),
          );
        }),
      )
      .handle(
        "remove",
        Effect.fn("environment.chatLibrary.remove")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          return yield* removeChatLibraryUpload(
            args.params.attachmentId,
            config.attachmentsDir,
          ).pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.catch(() => failEnvironmentInternal("internal_error")),
          );
        }),
      );
  }),
);
