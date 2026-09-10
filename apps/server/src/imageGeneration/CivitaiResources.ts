import { Effect, Schema, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import type {
  CivitaiResourceSearchInput,
  CivitaiResourceSearchResult,
  CivitaiImageOptions,
} from "@t3tools/contracts";
import {
  CIVITAI_MODELS,
  civitaiCapabilities,
  civitaiLoraFormat,
  type CivitaiModelDefinition,
} from "./CivitaiModels.ts";

export class CivitaiResourceError extends Schema.TaggedErrorClass<CivitaiResourceError>()(
  "CivitaiResourceError",
  { message: Schema.String },
) {}

const Version = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  baseModel: Schema.String,
  air: Schema.optionalKey(Schema.String),
  supportsGeneration: Schema.optionalKey(Schema.Boolean),
  trainedWords: Schema.optionalKey(Schema.Array(Schema.String)),
});
const Model = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  modelVersions: Schema.Array(Version),
});
const SearchResponse = Schema.Struct({
  items: Schema.Array(Model),
  metadata: Schema.optionalKey(
    Schema.Struct({
      nextCursor: Schema.optionalKey(Schema.NullOr(Schema.Union([Schema.String, Schema.Number]))),
    }),
  ),
});
const Detail = Schema.Struct({
  ...Version.fields,
  air: Schema.String,
  model: Schema.Struct({ type: Schema.String, name: Schema.optionalKey(Schema.String) }),
});
const Mini = Schema.Struct({
  canGenerate: Schema.Boolean,
  air: Schema.String,
  baseModel: Schema.String,
});
const decodeSearch = Schema.decodeUnknownEffect(Schema.fromJsonString(SearchResponse));
const decodeDetail = Schema.decodeUnknownEffect(Schema.fromJsonString(Detail));
const decodeMini = Schema.decodeUnknownEffect(Schema.fromJsonString(Mini));
const decodeModel = Schema.decodeUnknownEffect(Schema.fromJsonString(Model));
const isResourceError = Schema.is(CivitaiResourceError);
const Cursor = Schema.Struct({
  upstream: Schema.String,
  offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).check(
    Schema.isLessThanOrEqualTo(100000),
  ),
});
const decodeCursor = Schema.decodeUnknownEffect(Schema.fromJsonString(Cursor));
const encodeCursor = Schema.encodeSync(Schema.fromJsonString(Cursor));

/** Fixed-origin requests never follow redirects with the user's API key. */
const readSite = Effect.fn("Civitai.readSite")(function* (
  client: HttpClient.HttpClient,
  apiKey: string,
  path: string,
) {
  const response = yield* client
    .execute(
      HttpClientRequest.get(`https://civitai.com/api/v1/${path}`).pipe(
        HttpClientRequest.bearerToken(apiKey),
      ),
    )
    .pipe(
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
      Effect.timeout("20 seconds"),
      Effect.mapError(
        () => new CivitaiResourceError({ message: "Could not reach the Civitai model catalog." }),
      ),
    );
  if (response.status !== 200)
    return yield* new CivitaiResourceError({
      message:
        response.status === 401
          ? "Civitai rejected the API key. Update it in Settings."
          : response.status === 429
            ? "Civitai is rate limiting model searches. Try again shortly."
            : `Civitai resource lookup failed (HTTP ${response.status}).`,
    });
  const bytes = yield* response.stream.pipe(
    Stream.runFoldEffect(
      () => ({ chunks: [] as Uint8Array[], size: 0 }),
      (state, chunk) => {
        if (state.size + chunk.length > 2 * 1024 * 1024)
          return Effect.fail(
            new CivitaiResourceError({
              message: "Civitai catalog response exceeded the size limit.",
            }),
          );
        state.chunks.push(chunk);
        state.size += chunk.length;
        return Effect.succeed(state);
      },
    ),
    Effect.timeout("20 seconds"),
    Effect.mapError(
      () => new CivitaiResourceError({ message: "Could not read the Civitai model catalog." }),
    ),
  );
  return Buffer.concat(bytes.chunks).toString("utf8");
});

const parseAir = (air: string) =>
  /^urn:air:[^:]+:(checkpoint|diffusionmodel|unet|lora):civitai:(\d+)@(\d+)(?:\+\d+)?(?:\.[a-zA-Z0-9_-]+)?$/.exec(
    air,
  );

/** Parse identifiers only; catalog requests always use the fixed Civitai API origin. */
const parseResourceQuery = (query: string) => {
  const air = parseAir(query);
  if (air) return { versionId: air[3]!, modelId: air[2]!, air: query };
  if (!/^https?:\/\//i.test(query)) return undefined;
  const url = new URL(query);
  if (
    url.protocol !== "https:" ||
    !["civitai.com", "www.civitai.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    return null;
  const version = /^\/api\/v1\/model-versions\/(\d+)\/?$/.exec(url.pathname);
  if (version) return { versionId: version[1]! };
  const model = /^\/models\/(\d+)(?:\/[^/]*)?\/?$/.exec(url.pathname);
  if (!model) return null;
  const versionId = url.searchParams.get("modelVersionId");
  if (versionId !== null && !/^\d+$/.test(versionId)) return null;
  return { modelId: model[1]!, ...(versionId ? { versionId } : {}) };
};
const resolveResource = Effect.fn("Civitai.resolveResource")(function* (
  client: HttpClient.HttpClient,
  key: string,
  air: string,
  type: "Checkpoint" | "LORA",
  families: readonly string[],
) {
  const match = parseAir(air);
  if (!match || (type === "LORA" ? match[1] !== "lora" : match[1] === "lora"))
    return yield* new CivitaiResourceError({
      message: `Select a valid Civitai ${type === "LORA" ? "LoRA" : "checkpoint"} model version.`,
    });
  const detail = yield* readSite(client, key, `model-versions/${match[3]}`).pipe(
    Effect.flatMap(decodeDetail),
    Effect.mapError(
      () =>
        new CivitaiResourceError({
          message: "Could not verify the selected Civitai model version.",
        }),
    ),
  );
  const mini = yield* readSite(client, key, `model-versions/mini/${match[3]}`).pipe(
    Effect.flatMap(decodeMini),
    Effect.mapError(
      () =>
        new CivitaiResourceError({ message: "Could not verify Civitai generation availability." }),
    ),
  );
  if (
    detail.air !== air ||
    mini.air !== air ||
    detail.model.type !== type ||
    !families.includes(detail.baseModel) ||
    mini.baseModel !== detail.baseModel
  )
    return yield* new CivitaiResourceError({
      message: "The selected Civitai resource is not compatible with this model or checkpoint.",
    });
  if (!mini.canGenerate)
    return yield* new CivitaiResourceError({
      message: "The selected Civitai resource is unavailable for generation with your account.",
    });
  return detail;
});

export const searchCivitaiResources = Effect.fn("searchCivitaiResources")(function* (
  client: HttpClient.HttpClient,
  key: string,
  input: CivitaiResourceSearchInput,
): Effect.fn.Return<CivitaiResourceSearchResult, CivitaiResourceError> {
  const recipe = CIVITAI_MODELS.find((model) => model.id === input.model);
  const capabilities = recipe && civitaiCapabilities(recipe);
  if (!capabilities || (input.type === "Checkpoint" && capabilities.checkpoint === "unsupported"))
    return yield* new CivitaiResourceError({
      message: "This model does not support the requested Civitai resources.",
    });
  let families = capabilities.ecosystems;
  if (input.checkpoint)
    families = [
      (yield* resolveResource(client, key, input.checkpoint, "Checkpoint", families)).baseModel,
    ];
  const searchText = input.query?.trim() ?? "";
  const reference = yield* Effect.try({
    try: () => parseResourceQuery(searchText),
    catch: () =>
      new CivitaiResourceError({ message: "Enter a valid Civitai model URL or model name." }),
  });
  if (reference === null || (searchText.startsWith("urn:") && !reference))
    return yield* new CivitaiResourceError({
      message: "Enter a valid Civitai model URL, AIR, or model name.",
    });
  if (reference?.versionId) {
    const detail = yield* readSite(client, key, `model-versions/${reference.versionId}`).pipe(
      Effect.flatMap(decodeDetail),
      Effect.mapError((error) =>
        isResourceError(error)
          ? error
          : new CivitaiResourceError({ message: "Civitai returned an invalid model version." }),
      ),
    );
    const air = parseAir(detail.air);
    if (
      !air ||
      String(detail.id) !== reference.versionId ||
      air[3] !== reference.versionId ||
      (reference.modelId && air[2] !== reference.modelId) ||
      (reference.air && detail.air !== reference.air)
    )
      return yield* new CivitaiResourceError({
        message: "The Civitai model URL or AIR does not match this version.",
      });
    const verified = yield* resolveResource(client, key, detail.air, input.type, families);
    return {
      resources: [
        {
          air: verified.air,
          name: verified.model.name ?? verified.name,
          versionName: verified.name,
          baseModel: verified.baseModel,
          trainedWords: verified.trainedWords ?? [],
        },
      ],
    };
  }
  // The public search flag can be false for available ZImage checkpoints. Mini's
  // account-aware canGenerate value is checked for each candidate instead.
  const query = new URLSearchParams({ types: input.type, limit: "20" });
  for (const family of families) query.append("baseModels", family);
  if (searchText) query.set("query", searchText);
  const cursor = input.cursor
    ? yield* decodeCursor(Buffer.from(input.cursor, "base64url").toString("utf8")).pipe(
        Effect.mapError(
          () =>
            new CivitaiResourceError({
              message: "Invalid Civitai search cursor. Start a new search.",
            }),
        ),
      )
    : { upstream: "", offset: 0 };
  if (cursor.upstream) query.set("cursor", cursor.upstream);
  const result = yield* (
    reference?.modelId
      ? readSite(client, key, `models/${reference.modelId}`).pipe(
          Effect.flatMap(decodeModel),
          Effect.map((model): typeof SearchResponse.Type => ({ items: [model] })),
        )
      : readSite(client, key, `models?${query}`).pipe(Effect.flatMap(decodeSearch))
  ).pipe(
    Effect.mapError((error) =>
      isResourceError(error)
        ? error
        : new CivitaiResourceError({ message: "Civitai returned an invalid model catalog." }),
    ),
  );
  const allCandidates = result.items.flatMap((model) =>
    model.type !== input.type
      ? []
      : model.modelVersions
          .filter((version) => families.includes(version.baseModel))
          .map((version) => ({ model, version })),
  );
  const candidates = allCandidates.slice(cursor.offset, cursor.offset + 20);
  const resources = yield* Effect.forEach(
    candidates,
    ({ model, version }) =>
      Effect.gen(function* () {
        const detail = yield* readSite(client, key, `model-versions/${version.id}`).pipe(
          Effect.flatMap(decodeDetail),
          Effect.mapError(
            () =>
              new CivitaiResourceError({
                message: "Could not load Civitai model version details.",
              }),
          ),
        );
        if (
          !parseAir(detail.air) ||
          detail.id !== version.id ||
          detail.model.type !== input.type ||
          !families.includes(detail.baseModel)
        )
          return [];
        const mini = yield* readSite(client, key, `model-versions/mini/${version.id}`).pipe(
          Effect.flatMap(decodeMini),
          Effect.mapError((error) =>
            isResourceError(error)
              ? error
              : new CivitaiResourceError({
                  message: "Could not verify Civitai generation availability.",
                }),
          ),
        );
        if (!mini.canGenerate || mini.air !== detail.air || mini.baseModel !== detail.baseModel)
          return [];
        return [
          {
            air: detail.air,
            name: model.name,
            versionName: detail.name,
            baseModel: detail.baseModel,
            trainedWords: detail.trainedWords ?? [],
          },
        ];
      }),
    { concurrency: 4 },
  );
  const next =
    cursor.offset + candidates.length < allCandidates.length
      ? { upstream: cursor.upstream, offset: cursor.offset + candidates.length }
      : result.metadata?.nextCursor != null
        ? { upstream: String(result.metadata.nextCursor), offset: 0 }
        : undefined;
  return {
    resources: resources.flat(),
    ...(next ? { nextCursor: Buffer.from(encodeCursor(next)).toString("base64url") } : {}),
  };
});

/** Validate resources against account availability before submitting a paid workflow. */
export const resolveCivitaiOptions = Effect.fn("resolveCivitaiOptions")(function* (
  client: HttpClient.HttpClient,
  key: string,
  recipe: CivitaiModelDefinition,
  options?: CivitaiImageOptions,
): Effect.fn.Return<Record<string, unknown>, CivitaiResourceError> {
  const capabilities = civitaiCapabilities(recipe);
  if (!capabilities) {
    if (options && Object.keys(options).length)
      return yield* new CivitaiResourceError({
        message: "This Civitai model does not support advanced resource settings.",
      });
    return {};
  }
  if (capabilities.checkpoint === "required" && !options?.checkpoint)
    return yield* new CivitaiResourceError({
      message: "Select a checkpoint before generating with this model.",
    });
  const result: Record<string, unknown> = {};
  let families = capabilities.ecosystems;
  if (options?.checkpoint) {
    if (capabilities.checkpoint === "unsupported")
      return yield* new CivitaiResourceError({
        message: "This model does not support a checkpoint override.",
      });
    const checkpoint = yield* resolveResource(
      client,
      key,
      options.checkpoint,
      "Checkpoint",
      families,
    );
    families = [checkpoint.baseModel];
    result[capabilities.checkpoint === "required" ? "model" : "diffuserModel"] = checkpoint.air;
  }
  const loras = options?.loras ?? [];
  if (
    loras.length > capabilities.maxLoras ||
    new Set(loras.map((lora) => lora.air)).size !== loras.length
  )
    return yield* new CivitaiResourceError({ message: "Use up to ten distinct LoRAs." });
  for (const lora of loras) {
    if (
      !Number.isFinite(lora.strength) ||
      lora.strength < capabilities.strength.min ||
      lora.strength > capabilities.strength.max
    )
      return yield* new CivitaiResourceError({
        message: `LoRA strength must be between ${capabilities.strength.min} and ${capabilities.strength.max}.`,
      });
  }
  if (loras.length) {
    const resolved = yield* Effect.forEach(
      loras,
      (lora) => resolveResource(client, key, lora.air, "LORA", families),
      { concurrency: 4 },
    );
    result.loras =
      civitaiLoraFormat(recipe) === "array"
        ? resolved.map((resource, index) => ({
            air: resource.air,
            strength: loras[index]!.strength,
          }))
        : Object.fromEntries(
            resolved.map((resource, index) => [resource.air, loras[index]!.strength]),
          );
  }
  if (options?.negativePrompt !== undefined) {
    if (!capabilities.negativePrompt || options.negativePrompt.length > 10000)
      return yield* new CivitaiResourceError({
        message: "This model does not support the supplied negative prompt.",
      });
    result.negativePrompt = options.negativePrompt;
  }
  for (const field of ["steps", "cfgScale"] as const) {
    const value = options?.[field];
    const range = capabilities[field];
    if (value === undefined) continue;
    if (
      !range ||
      !Number.isFinite(value) ||
      (field === "steps" && !Number.isInteger(value)) ||
      value < range.min ||
      value > range.max
    )
      return yield* new CivitaiResourceError({
        message: `Invalid ${field} for this Civitai model.`,
      });
    const fluxDev = recipe.routing.engine === "flux2" && recipe.routing.model === "dev";
    const target =
      field === "cfgScale" && (fluxDev || recipe.routing.engine === "wan")
        ? "guidanceScale"
        : field === "steps" && fluxDev
          ? "numInferenceSteps"
          : field;
    result[target] = value;
  }
  return result;
});
