import { describe, expect, it } from "@effect/vitest";
import { ChatLibraryUploadInput, EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { PrimaryConnectionTarget, type PreparedConnection } from "../connection/model.ts";
import { remoteHttpClientLayer } from "../rpc/http.ts";
import { fetchChatLibrary, removeChatLibraryFile, uploadChatLibraryFile } from "./chatLibrary.ts";

const environmentId = Schema.decodeUnknownSync(EnvironmentId)("library-test");
const prepared: PreparedConnection = {
  environmentId,
  label: "Test environment",
  httpBaseUrl: "https://library.example.test/",
  socketUrl: "wss://library.example.test/ws",
  httpAuthorization: null,
  target: new PrimaryConnectionTarget({
    environmentId,
    label: "Test environment",
    httpBaseUrl: "https://library.example.test/",
    wsBaseUrl: "wss://library.example.test/",
  }),
};

describe("fetchChatLibrary", () => {
  it.effect("preserves the upload id and bytes in an authenticated upload", () =>
    Effect.gen(function* () {
      const payload = {
        uploadId: "ac6a1486-af31-4c4f-8f1f-dafde55f7269",
        name: "notes.txt",
        mimeType: "text/plain",
        dataBase64: "bm90ZXM=",
      };
      const calls: Array<RequestInit | undefined> = [];
      const fetchFn: typeof fetch = (_input, init) => {
        calls.push(init);
        return Promise.resolve(
          Response.json({
            attachment: {
              type: "file",
              id: "library-test",
              name: "notes.txt",
              mimeType: "text/plain",
              sizeBytes: 5,
            },
            threadId: null,
            threadTitle: null,
            messageId: null,
            createdAt: "2026-09-09T12:00:00.000Z",
          }),
        );
      };
      const result = yield* uploadChatLibraryFile(prepared, payload).pipe(
        Effect.provide(remoteHttpClientLayer(fetchFn)),
      );
      expect(result.threadId).toBeNull();
      expect(calls[0]?.method).toBe("POST");
      expect(calls[0]?.credentials).toBe("include");
      const body = calls[0]?.body;
      expect(body).toBeInstanceOf(Uint8Array);
      if (!(body instanceof Uint8Array)) throw new Error("Expected an encoded upload body");
      const decoded = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(ChatLibraryUploadInput),
      )(new TextDecoder().decode(body));
      expect(decoded).toEqual(payload);
    }),
  );

  it.effect("removes a direct upload in its own environment", () =>
    Effect.gen(function* () {
      const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
      const fetchFn: typeof fetch = (input, init) => {
        calls.push({ url: String(input), init });
        return Promise.resolve(Response.json({ deleted: true }));
      };
      const result = yield* removeChatLibraryFile(prepared, "library-test").pipe(
        Effect.provide(remoteHttpClientLayer(fetchFn)),
      );
      expect(result.deleted).toBe(true);
      expect(calls[0]?.url).toBe("https://library.example.test/api/chat/library/library-test");
      expect(calls[0]?.init?.method).toBe("DELETE");
    }),
  );
  it.effect("sends bounded filters to the selected environment with session cookies", () =>
    Effect.gen(function* () {
      const calls: Array<{ url: URL; init: RequestInit | undefined }> = [];
      const fetchFn: typeof fetch = (input, init) => {
        calls.push({ url: new URL(String(input)), init });
        return Promise.resolve(Response.json({ items: [], nextOffset: null }));
      };
      const result = yield* fetchChatLibrary(prepared, {
        offset: 48,
        limit: 48,
        query: "report & notes",
        category: "files",
      }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));
      expect(result).toEqual({ items: [], nextOffset: null });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url.origin).toBe("https://library.example.test");
      expect(calls[0]?.url.pathname).toBe("/api/chat/library");
      expect(calls[0]?.url.searchParams.get("query")).toBe("report & notes");
      expect(calls[0]?.url.searchParams.get("offset")).toBe("48");
      expect(calls[0]?.init?.credentials).toBe("include");
    }),
  );

  it.effect("uses bearer authentication for a remote environment", () =>
    Effect.gen(function* () {
      let headers = new Headers();
      const fetchFn: typeof fetch = (_input, init) => {
        headers = new Headers(init?.headers);
        return Promise.resolve(Response.json({ items: [], nextOffset: null }));
      };
      yield* fetchChatLibrary(
        { ...prepared, httpAuthorization: { _tag: "Bearer", token: "test-token" } },
        {},
      ).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));
      expect(headers.get("authorization")).toBe("Bearer test-token");
    }),
  );

  it.effect("rejects malformed results instead of presenting an empty library", () =>
    Effect.gen(function* () {
      const fetchFn: typeof fetch = () => Promise.resolve(Response.json({ items: "invalid" }));
      const result = yield* fetchChatLibrary(prepared, {}).pipe(
        Effect.provide(remoteHttpClientLayer(fetchFn)),
        Effect.result,
      );
      expect(result._tag).toBe("Failure");
    }),
  );
});
