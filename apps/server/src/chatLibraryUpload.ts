import {
  ChatAttachment,
  ChatLibraryItem,
  type ChatLibraryUploadInput,
  EnvironmentHttpBadRequestError,
  PROVIDER_SEND_TURN_MAX_FILE_BYTES,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { resolveAttachmentPath } from "./attachmentStore.ts";
import { parseBase64DataUrl } from "./imageMime.ts";

const decodeAttachment = Schema.decodeUnknownEffect(ChatAttachment);
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...ChatLibraryItem.fields,
      attachment: Schema.fromJsonString(ChatAttachment),
    }),
  ),
);
const encodeAttachment = Schema.encodeEffect(Schema.fromJsonString(ChatAttachment));

/** Store original bytes independently of conversations, with retries keyed by upload UUID. */
export const uploadChatLibrary = Effect.fn("uploadChatLibrary")(function* (
  input: ChatLibraryUploadInput,
  attachmentsDir: string,
) {
  const sql = yield* SqlClient.SqlClient;
  const fs = yield* FileSystem.FileSystem;
  const mimeType = input.mimeType.trim().toLowerCase();
  const parsed = parseBase64DataUrl(`data:${mimeType};base64,${input.dataBase64}`);
  if (!parsed || parsed.base64 !== input.dataBase64) {
    return yield* new EnvironmentHttpBadRequestError({
      message: "The upload payload is not valid base64.",
    });
  }
  const bytes = Buffer.from(parsed.base64, "base64");
  const type = mimeType.startsWith("image/") ? "image" : "file";
  const maximum =
    type === "image" ? PROVIDER_SEND_TURN_MAX_IMAGE_BYTES : PROVIDER_SEND_TURN_MAX_FILE_BYTES;
  if (
    bytes.length === 0 ||
    bytes.length > maximum ||
    bytes.toString("base64") !== input.dataBase64
  ) {
    return yield* new EnvironmentHttpBadRequestError({
      message: "The file is empty, too large, or has an invalid upload payload.",
    });
  }
  let writtenPath: string | undefined;
  return yield* sql
    .withTransaction(
      Effect.gen(function* () {
        const removed = yield* sql`SELECT upload_id FROM chat_library_uploads
      WHERE upload_id = ${input.uploadId} AND deleted_at IS NOT NULL`;
        if (removed.length > 0) {
          return yield* new EnvironmentHttpBadRequestError({
            message: "This upload was removed. Start a new upload to save it again.",
          });
        }
        const existing = yield* sql`SELECT attachment_json AS attachment, created_at AS "createdAt",
      NULL AS "threadId", NULL AS "threadTitle", NULL AS "messageId"
      FROM chat_library_uploads WHERE upload_id = ${input.uploadId}`;
        const [saved] = yield* decodeRows(existing);
        if (saved) {
          const savedPath = resolveAttachmentPath({ attachmentsDir, attachment: saved.attachment });
          if (
            !savedPath ||
            saved.attachment.name !== input.name ||
            saved.attachment.mimeType !== mimeType ||
            !Buffer.from(yield* fs.readFile(savedPath)).equals(bytes)
          ) {
            return yield* new EnvironmentHttpBadRequestError({
              message: "This upload ID has already been used for another file.",
            });
          }
          return saved;
        }
        const attachment = yield* decodeAttachment({
          // The underscore keeps standalone uploads outside thread attachment cleanup namespaces.
          id: `library_${input.uploadId}`,
          type,
          name: input.name,
          mimeType,
          sizeBytes: bytes.length,
        });
        const filePath = resolveAttachmentPath({ attachmentsDir, attachment });
        if (!filePath) {
          return yield* new EnvironmentHttpBadRequestError({
            message: "The file could not be stored.",
          });
        }
        const createdAt = DateTime.formatIso(yield* DateTime.now);
        yield* fs.makeDirectory(attachmentsDir, { recursive: true });
        yield* Effect.scoped(
          Effect.gen(function* () {
            const file = yield* fs.open(filePath, { flag: "wx" });
            writtenPath = filePath;
            yield* file.writeAll(bytes);
          }),
        );
        yield* sql`INSERT INTO chat_library_uploads (upload_id, attachment_json, created_at)
      VALUES (${input.uploadId}, ${yield* encodeAttachment(attachment)}, ${createdAt})`;
        return { attachment, createdAt, threadId: null, threadTitle: null, messageId: null };
      }),
    )
    .pipe(
      Effect.onError(() =>
        writtenPath ? fs.remove(writtenPath, { force: true }).pipe(Effect.orDie) : Effect.void,
      ),
      Effect.uninterruptible,
    );
});

/** Keep a tombstone so a delayed retry cannot recreate a removed upload. */
export const removeChatLibraryUpload = Effect.fn("removeChatLibraryUpload")(function* (
  attachmentId: string,
  attachmentsDir: string,
) {
  const sql = yield* SqlClient.SqlClient;
  const fs = yield* FileSystem.FileSystem;
  const rows = yield* sql`SELECT attachment_json AS attachment, created_at AS "createdAt",
    NULL AS "threadId", NULL AS "threadTitle", NULL AS "messageId"
    FROM chat_library_uploads WHERE json_extract(attachment_json, '$.id') = ${attachmentId}`;
  const [saved] = yield* decodeRows(rows);
  if (!saved) return { deleted: false };
  yield* sql`UPDATE chat_library_uploads SET deleted_at = ${DateTime.formatIso(yield* DateTime.now)}
    WHERE json_extract(attachment_json, '$.id') = ${attachmentId} AND deleted_at IS NULL`;
  const filePath = resolveAttachmentPath({ attachmentsDir, attachment: saved.attachment });
  if (filePath) yield* fs.remove(filePath, { force: true });
  return { deleted: true };
});
