import { assert, it } from "vite-plus/test";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { listChatLibrary } from "./chatLibrary.ts";
import { uploadChatLibrary, removeChatLibraryUpload } from "./chatLibraryUpload.ts";
import { parseThreadSegmentFromAttachmentId, resolveAttachmentPathById } from "./attachmentStore.ts";
import { runMigrations } from "./persistence/Migrations.ts";
import * as NodeSqliteClient from "./persistence/NodeSqliteClient.ts";

const testLayer = Layer.mergeAll(NodeFileSystem.layer, NodeSqliteClient.layerMemory());
const input = {
  uploadId: "233c6b68-515f-4b22-8f02-edac9cb5f99d",
  name: "notes.pdf",
  mimeType: "application/pdf",
  dataBase64: Buffer.from("original bytes").toString("base64"),
};

it("saves original files, retries once, and removes only standalone library files", () =>
  Effect.gen(function* () {
    yield* runMigrations();
    const fs = yield* FileSystem.FileSystem;
    const attachmentsDir = yield* fs.makeTempDirectoryScoped();
    const saved = yield* uploadChatLibrary(input, attachmentsDir);
    assert.strictEqual(saved.threadId, null);
    assert.strictEqual(parseThreadSegmentFromAttachmentId(saved.attachment.id), null);
    const filePath = resolveAttachmentPathById({
      attachmentsDir,
      attachmentId: saved.attachment.id,
    });
    assert.ok(filePath);
    assert.strictEqual(Buffer.from(yield* fs.readFile(filePath)).toString(), "original bytes");
    assert.deepEqual(yield* uploadChatLibrary(input, attachmentsDir), saved);
    assert.strictEqual((yield* listChatLibrary({ category: "files" })).items.length, 1);
    const conflict = yield* uploadChatLibrary(
      { ...input, dataBase64: "b3RoZXI=" },
      attachmentsDir,
    ).pipe(Effect.result);
    assert.strictEqual(conflict._tag, "Failure");
    assert.deepEqual(yield* removeChatLibraryUpload("chat-attachment", attachmentsDir), {
      deleted: false,
    });
    assert.deepEqual(yield* removeChatLibraryUpload(saved.attachment.id, attachmentsDir), {
      deleted: true,
    });
    assert.strictEqual(yield* fs.exists(filePath), false);
    assert.strictEqual((yield* listChatLibrary({})).items.length, 0);
    assert.deepEqual(yield* removeChatLibraryUpload(saved.attachment.id, attachmentsDir), {
      deleted: true,
    });
    assert.strictEqual(
      (yield* uploadChatLibrary(input, attachmentsDir).pipe(Effect.result))._tag,
      "Failure",
    );
  }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise));

it("rejects invalid payloads and removes written bytes when metadata persistence fails", () =>
  Effect.gen(function* () {
    yield* runMigrations();
    const sql = yield* SqlClient.SqlClient;
    const fs = yield* FileSystem.FileSystem;
    const attachmentsDir = yield* fs.makeTempDirectoryScoped();
    for (const dataBase64 of ["", "!!!!", Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64")]) {
      assert.strictEqual(
        (yield* uploadChatLibrary({ ...input, dataBase64 }, attachmentsDir).pipe(Effect.result))
          ._tag,
        "Failure",
      );
    }
    yield* sql`CREATE TRIGGER reject_library_upload BEFORE INSERT ON chat_library_uploads
      BEGIN SELECT RAISE(ABORT, 'test rejection'); END`;
    assert.strictEqual(
      (yield* uploadChatLibrary(input, attachmentsDir).pipe(Effect.result))._tag,
      "Failure",
    );
    assert.deepEqual(yield* fs.readDirectory(attachmentsDir), []);
    assert.strictEqual((yield* listChatLibrary({})).items.length, 0);
  }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise));
