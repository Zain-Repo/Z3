import * as Schema from "effect/Schema";
import { IsoDateTime, MessageId, ThreadId } from "./baseSchemas.ts";
import {
  ChatAttachment,
  ChatFileAttachment,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "./orchestration.ts";

export const ChatLibraryQuery = Schema.Struct({
  offset: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(255))),
  category: Schema.optionalKey(Schema.Literals(["all", "images", "files"])),
});
export type ChatLibraryQuery = typeof ChatLibraryQuery.Type;
export const ChatLibraryListInput = ChatLibraryQuery;
export type ChatLibraryListInput = ChatLibraryQuery;

export const ChatLibraryItem = Schema.Struct({
  attachment: ChatAttachment,
  threadId: Schema.NullOr(ThreadId),
  threadTitle: Schema.NullOr(Schema.String),
  messageId: Schema.NullOr(MessageId),
  createdAt: IsoDateTime,
});
export type ChatLibraryItem = typeof ChatLibraryItem.Type;

export const ChatLibraryPage = Schema.Struct({
  items: Schema.Array(ChatLibraryItem),
  nextOffset: Schema.NullOr(Schema.Int),
});
export type ChatLibraryPage = typeof ChatLibraryPage.Type;

export const ChatLibraryUploadInput = Schema.Struct({
  uploadId: Schema.String.check(Schema.isUUID()),
  name: ChatFileAttachment.fields.name,
  mimeType: ChatFileAttachment.fields.mimeType,
  dataBase64: Schema.String.check(
    Schema.isMaxLength(Math.ceil(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES / 3) * 4),
  ),
});
export type ChatLibraryUploadInput = typeof ChatLibraryUploadInput.Type;
