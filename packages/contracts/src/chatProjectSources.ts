import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const Z3ChatSourceIndexStatus = Schema.Literals(["in_progress", "completed", "failed"]);
export type Z3ChatSourceIndexStatus = typeof Z3ChatSourceIndexStatus.Type;

export const Z3ChatProjectSourceUploadInput = Schema.Struct({
  projectId: TrimmedNonEmptyString,
  sourceId: TrimmedNonEmptyString,
  projectName: TrimmedNonEmptyString,
  fileName: TrimmedNonEmptyString,
  mimeType: Schema.String,
  contentBase64: Schema.String,
  embeddingModel: TrimmedNonEmptyString,
});
export type Z3ChatProjectSourceUploadInput = typeof Z3ChatProjectSourceUploadInput.Type;

export const Z3ChatProjectSourceUploadResult = Schema.Struct({
  sourceId: TrimmedNonEmptyString,
  embeddingModel: TrimmedNonEmptyString,
  embeddingDimensions: Schema.Int,
  chunkCount: Schema.Int,
  indexedAt: Schema.String,
  status: Z3ChatSourceIndexStatus,
});
export type Z3ChatProjectSourceUploadResult = typeof Z3ChatProjectSourceUploadResult.Type;

export const Z3ChatProjectSourceDeleteInput = Schema.Struct({
  projectId: TrimmedNonEmptyString,
  sourceId: TrimmedNonEmptyString,
});
export type Z3ChatProjectSourceDeleteInput = typeof Z3ChatProjectSourceDeleteInput.Type;

export const Z3ChatProjectSourceDeleteResult = Schema.Struct({
  deleted: Schema.Boolean,
});
export type Z3ChatProjectSourceDeleteResult = typeof Z3ChatProjectSourceDeleteResult.Type;

export class Z3ChatProjectSourceError extends Schema.TaggedErrorClass<Z3ChatProjectSourceError>()(
  "Z3ChatProjectSourceError",
  {
    code: Schema.Union([
      Schema.Literal("not_configured"),
      Schema.Literal("invalid_input"),
      Schema.Literal("openrouter"),
    ]),
    message: Schema.String,
  },
) {}
