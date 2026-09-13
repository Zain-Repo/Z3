const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

export function referenceFileError(type: string, bytes: Uint8Array): string | undefined {
  if (!bytes.length || bytes.length > MAX_REFERENCE_BYTES)
    return "Choose an image between 1 byte and 8 MB.";
  const signature = Array.from(bytes.slice(0, 12));
  const matches =
    type === "image/png"
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => signature[i] === value)
      : type === "image/jpeg"
        ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
        : type === "image/webp"
          ? String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...signature.slice(8, 12)) === "WEBP"
          : false;
  return matches ? undefined : "Choose a valid PNG, JPEG, or WebP image.";
}

export async function readFlowReference(file: File): Promise<{ name: string; url: string }> {
  if (file.size > MAX_REFERENCE_BYTES) throw new Error("Reference images must be 8 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const error = referenceFileError(file.type, bytes);
  if (error) throw new Error(error);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return { name: file.name, url: `data:${file.type};base64,${btoa(chunks.join(""))}` };
}
