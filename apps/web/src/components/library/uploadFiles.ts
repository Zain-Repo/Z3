import {
  PROVIDER_SEND_TURN_MAX_FILE_BYTES,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "@t3tools/contracts";

export const LIBRARY_UPLOAD_BATCH_LIMIT = 10;

export function libraryFileValidationError(
  file: Pick<File, "name" | "type" | "size">,
): string | null {
  if (file.size === 0) return "Choose a file that isn’t empty.";
  if (!file.name.trim() || file.name.length > 255)
    return "Use a filename between 1 and 255 characters.";
  const image = file.type.startsWith("image/");
  const maximum = image ? PROVIDER_SEND_TURN_MAX_IMAGE_BYTES : PROVIDER_SEND_TURN_MAX_FILE_BYTES;
  if (file.size > maximum)
    return image ? "Images must be 10 MB or smaller." : "Files must be 2 MB or smaller.";
  return null;
}

/** FileReader can be interrupted when the library unmounts or changes environments. */
export function readLibraryFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Upload cancelled"));
      return;
    }
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    reader.addEventListener(
      "load",
      () => {
        cleanup();
        if (typeof reader.result !== "string") {
          reject(new Error("Could not read this file."));
          return;
        }
        resolve(reader.result.slice(reader.result.indexOf(",") + 1));
      },
      { once: true },
    );
    reader.addEventListener(
      "error",
      () => {
        cleanup();
        reject(new Error("Could not read this file."));
      },
      { once: true },
    );
    reader.addEventListener(
      "abort",
      () => {
        cleanup();
        reject(new Error("Upload cancelled"));
      },
      { once: true },
    );
    reader.readAsDataURL(file);
  });
}
