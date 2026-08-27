import type { ImageGenerationParameterDescriptor } from "@t3tools/contracts";

/**
 * Keeps an enum-valued form field valid for the selected model. When the
 * current value is not in the model's accepted set, fall back to the first
 * accepted value so the request never carries an invalid option.
 */
export function clampEnumValue(
  descriptor: ImageGenerationParameterDescriptor | undefined,
  current: string,
): string {
  if (descriptor?.type !== "enum" || descriptor.values.length === 0) return current;
  return descriptor.values.includes(current) ? current : (descriptor.values[0] ?? current);
}

/**
 * Clamps a numeric form field into the range the selected model accepts.
 */
export function clampNumberValue(
  descriptor: ImageGenerationParameterDescriptor | undefined,
  current: number,
  defaultMin: number,
  defaultMax: number,
): number {
  if (descriptor?.type !== "range") return current;
  return Math.min(descriptor.max, Math.max(descriptor.min, current));
}

/**
 * Builds the selectable image counts for a model. Models without an `n`
 * capability only expose a single image, and options never exceed the model's
 * range even when OpenRouter allows up to ten.
 */
export function countOptionsFor(
  descriptor: ImageGenerationParameterDescriptor | undefined,
  maxOptions = 4,
): ReadonlyArray<number> {
  if (descriptor === undefined) return [1];
  const max = descriptor.type === "range" ? Math.floor(descriptor.max) : 10;
  const count = Math.max(1, Math.min(maxOptions, max));
  return Array.from({ length: count }, (_, index) => index + 1);
}

/**
 * Reference-image bounds for the selected model. When a model requires a
 * minimum number of references (for example style-transfer models), the form
 * blocks generation until that minimum is met.
 */
export function referenceImageBounds(
  descriptor: ImageGenerationParameterDescriptor | undefined,
  fallbackMax = 4,
): { readonly min: number; readonly max: number } {
  if (descriptor?.type !== "range") return { min: 0, max: fallbackMax };
  return {
    min: Math.max(0, Math.floor(descriptor.min)),
    max: Math.max(1, Math.floor(descriptor.max)),
  };
}
