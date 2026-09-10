import { describe, expect, it } from "@effect/vitest";
import {
  PROVIDER_SEND_TURN_MAX_FILE_BYTES,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "@t3tools/contracts";
import { libraryFileValidationError, readLibraryFile } from "./uploadFiles";

describe("library uploads", () => {
  it("applies the attachment limit for each file type before reading bytes", () => {
    expect(
      libraryFileValidationError({
        name: "photo.png",
        type: "image/png",
        size: PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
      }),
    ).toBeNull();
    expect(
      libraryFileValidationError({
        name: "photo.png",
        type: "image/png",
        size: PROVIDER_SEND_TURN_MAX_IMAGE_BYTES + 1,
      }),
    ).toContain("10 MB");
    expect(
      libraryFileValidationError({
        name: "notes.pdf",
        type: "application/pdf",
        size: PROVIDER_SEND_TURN_MAX_FILE_BYTES,
      }),
    ).toBeNull();
    expect(
      libraryFileValidationError({
        name: "notes.pdf",
        type: "application/pdf",
        size: PROVIDER_SEND_TURN_MAX_FILE_BYTES + 1,
      }),
    ).toContain("2 MB");
    expect(
      libraryFileValidationError({
        name: "unknown",
        type: "",
        size: PROVIDER_SEND_TURN_MAX_FILE_BYTES + 1,
      }),
    ).toContain("2 MB");
  });

  it("rejects empty and overly long names", () => {
    expect(
      libraryFileValidationError({ name: "empty.txt", type: "text/plain", size: 0 }),
    ).not.toBeNull();
    expect(libraryFileValidationError({ name: " ", type: "text/plain", size: 1 })).not.toBeNull();
    expect(
      libraryFileValidationError({ name: "a".repeat(256), type: "text/plain", size: 1 }),
    ).not.toBeNull();
  });

  it("does not start reading an upload after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readLibraryFile(new File(["notes"], "notes.txt"), controller.signal),
    ).rejects.toThrow("Upload cancelled");
  });
});
