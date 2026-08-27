import type { ImageGenerationInput } from "@t3tools/contracts";

type ImageDimensions = Pick<ImageGenerationInput, "aspectRatio" | "size">;

const DIMENSION_PATTERN = /^(\d+(?:\.\d+)?)\s*(?::|\/|x)\s*(\d+(?:\.\d+)?)$/i;

function parseDimensionRatio(value: string | undefined): number | null {
  if (!value) return null;

  const match = DIMENSION_PATTERN.exec(value.trim());
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return width / height;
}

export function imageAspectRatio(input: ImageDimensions | undefined): number {
  return parseDimensionRatio(input?.size) ?? parseDimensionRatio(input?.aspectRatio) ?? 1;
}

export function imageGridAspectRatio(
  input: ImageDimensions | undefined,
  imageCount: number,
): number {
  const safeImageCount = Math.max(1, Math.floor(imageCount));
  const columns = safeImageCount > 1 ? 2 : 1;
  const rows = Math.ceil(safeImageCount / columns);
  return (imageAspectRatio(input) * columns) / rows;
}
