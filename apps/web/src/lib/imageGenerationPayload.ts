import {
  ProviderInstanceId,
  type ImageGenerationInput,
  type ImageGenerationRecord,
} from "@t3tools/contracts";

const QUALITY_VALUES = ["auto", "low", "medium", "high"] as const;
const OUTPUT_FORMAT_VALUES = ["png", "jpeg", "webp", "svg"] as const;
const BACKGROUND_VALUES = ["auto", "transparent", "opaque"] as const;

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOneOf<const T extends ReadonlyArray<string>>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function invalidField(field: string, expected: string): { readonly error: string } {
  return { error: `${field} must be ${expected}.` };
}

/**
 * Parses the direct payload shape copied from the image gallery. A complete
 * generation record is also accepted so users can paste either JSON export.
 */
export function parseImageGenerationPayload(
  text: string,
): { readonly input: ImageGenerationInput } | { readonly error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { error: "Paste valid JSON before applying it." };
  }

  if (!isJsonRecord(parsed)) return { error: "The image payload must be a JSON object." };
  const candidate = isJsonRecord(parsed.input) ? parsed.input : parsed;

  if (!nonEmptyString(candidate.model)) return invalidField("model", "a non-empty string");
  if (!nonEmptyString(candidate.prompt)) return invalidField("prompt", "a non-empty string");

  const optionalFields: {
    providerInstanceId?: NonNullable<ImageGenerationInput["providerInstanceId"]>;
    stream?: boolean;
    n?: number;
    resolution?: string;
    aspectRatio?: string;
    size?: string;
    quality?: (typeof QUALITY_VALUES)[number];
    outputFormat?: (typeof OUTPUT_FORMAT_VALUES)[number];
    background?: (typeof BACKGROUND_VALUES)[number];
    outputCompression?: number;
    seed?: number;
    inputReferences?: Array<{ url: string }>;
    provider?: JsonRecord;
  } = {};

  const input: ImageGenerationInput = {
    ...optionalFields,
    model: candidate.model.trim(),
    prompt: candidate.prompt.trim(),
  };

  if (candidate.providerInstanceId !== undefined) {
    if (!nonEmptyString(candidate.providerInstanceId)) {
      return invalidField("providerInstanceId", "a non-empty string");
    }
    optionalFields.providerInstanceId = ProviderInstanceId.make(
      candidate.providerInstanceId.trim(),
    );
  }
  if (candidate.stream !== undefined) {
    if (typeof candidate.stream !== "boolean") return invalidField("stream", "a boolean");
    optionalFields.stream = candidate.stream;
  }
  if (candidate.n !== undefined) {
    if (
      typeof candidate.n !== "number" ||
      !Number.isInteger(candidate.n) ||
      candidate.n < 1 ||
      candidate.n > 10
    ) {
      return invalidField("n", "an integer between 1 and 10");
    }
    optionalFields.n = candidate.n;
  }

  for (const field of ["resolution", "aspectRatio", "size"] as const) {
    const value = candidate[field];
    if (value === undefined) continue;
    if (!nonEmptyString(value)) return invalidField(field, "a non-empty string");
    optionalFields[field] = value.trim();
  }

  if (candidate.quality !== undefined) {
    if (!isOneOf(candidate.quality, QUALITY_VALUES)) {
      return invalidField("quality", 'one of "auto", "low", "medium", or "high"');
    }
    optionalFields.quality = candidate.quality;
  }
  if (candidate.outputFormat !== undefined) {
    if (!isOneOf(candidate.outputFormat, OUTPUT_FORMAT_VALUES)) {
      return invalidField("outputFormat", 'one of "png", "jpeg", "webp", or "svg"');
    }
    optionalFields.outputFormat = candidate.outputFormat;
  }
  if (candidate.background !== undefined) {
    if (!isOneOf(candidate.background, BACKGROUND_VALUES)) {
      return invalidField("background", 'one of "auto", "transparent", or "opaque"');
    }
    optionalFields.background = candidate.background;
  }
  if (candidate.outputCompression !== undefined) {
    if (
      typeof candidate.outputCompression !== "number" ||
      !Number.isInteger(candidate.outputCompression) ||
      candidate.outputCompression < 0 ||
      candidate.outputCompression > 100
    ) {
      return invalidField("outputCompression", "an integer between 0 and 100");
    }
    optionalFields.outputCompression = candidate.outputCompression;
  }
  if (candidate.seed !== undefined) {
    if (typeof candidate.seed !== "number" || !Number.isInteger(candidate.seed)) {
      return invalidField("seed", "an integer");
    }
    optionalFields.seed = candidate.seed;
  }
  if (candidate.inputReferences !== undefined) {
    if (!Array.isArray(candidate.inputReferences)) {
      return invalidField("inputReferences", "an array of objects with non-empty url values");
    }
    const references: Array<{ url: string }> = [];
    for (const reference of candidate.inputReferences) {
      if (!isJsonRecord(reference) || !nonEmptyString(reference.url)) {
        return invalidField("inputReferences", "an array of objects with non-empty url values");
      }
      references.push({ url: reference.url.trim() });
    }
    optionalFields.inputReferences = references;
  }
  if (candidate.provider !== undefined) {
    if (!isJsonRecord(candidate.provider)) return invalidField("provider", "a JSON object");
    optionalFields.provider = candidate.provider;
  }

  return { input: { ...input, ...optionalFields } };
}

export function serializeImageGenerationPayload(input: ImageGenerationInput): string {
  return JSON.stringify(input, null, 2);
}

export function reusableImageGenerationInput(
  generation: ImageGenerationRecord,
): ImageGenerationInput {
  return generation.input ?? { model: generation.model, prompt: generation.prompt };
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") throw new Error("Clipboard is unavailable.");
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard is unavailable.");
}
