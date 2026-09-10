import * as NodeNet from "node:net";
import * as NodeCrypto from "node:crypto";
import { CIVITAI_MODELS, civitaiCapabilities } from "./CivitaiModels.ts";
import { resolveCivitaiOptions } from "./CivitaiResources.ts";
import type { ImageGenerationInput, ImageGenerationModel } from "@t3tools/contracts";
import { Clock, Duration, Effect, Random, Schema, Stream } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/unstable/http";
import {
  detectOpenRouterImageMimeType,
  type OpenRouterImageGenerationResult,
} from "../provider/Layers/OpenRouterApi.ts";

export class CivitaiApiError extends Schema.TaggedErrorClass<CivitaiApiError>()("CivitaiApiError", {
  message: Schema.String,
}) {}

const isCivitaiApiError = Schema.is(CivitaiApiError);

const origin = "https://orchestration.civitai.com";
const inputParameters = [
  ["n", "n"],
  ["size", "size"],
  ["aspectRatio", "aspect_ratio"],
  ["resolution", "resolution"],
  ["quality", "quality"],
  ["outputFormat", "output_format"],
  ["seed", "seed"],
] as const;
/** Exposes only recipes whose request fields this adapter implements. */
export const fetchCivitaiImageModels = Effect.fn("fetchCivitaiImageModels")(function* (
  _httpClient: HttpClient.HttpClient,
  _apiKey: string,
): Effect.fn.Return<Array<ImageGenerationModel>> {
  return yield* Effect.succeed(
    CIVITAI_MODELS.map<ImageGenerationModel>((recipe) => ({
      id: recipe.id,
      group: recipe.group,
      name: recipe.name,
      ...(civitaiCapabilities(recipe) ? { civitai: civitaiCapabilities(recipe)! } : {}),
      inputModalities: ["text"],
      outputModalities: ["image"],
      supportedParameters: recipe.supportedParameters,
      supportsStreaming: false,
    })),
  );
});

const Blob = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  available: Schema.Boolean,
  url: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
// The submit and poll endpoints share this lifecycle; queued states are not terminal.
// https://developer.civitai.com/orchestration/guide/workflows#status-lifecycle
const WorkflowStatus = Schema.Literals([
  "unassigned",
  "preparing",
  "scheduled",
  "processing",
  "succeeded",
  "failed",
  "expired",
  "canceled",
]);
const isTerminalStatus = (status: typeof WorkflowStatus.Type) =>
  status === "succeeded" || status === "failed" || status === "expired" || status === "canceled";
const Workflow = Schema.Struct({
  id: Schema.String,
  status: WorkflowStatus,
  steps: Schema.Array(
    Schema.Struct({
      jobs: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            reason: Schema.optionalKey(Schema.NullOr(Schema.String)),
          }),
        ),
      ),
      output: Schema.optionalKey(
        Schema.NullOr(
          Schema.Struct({
            images: Schema.optionalKey(Schema.Array(Blob)),
            blobs: Schema.optionalKey(Schema.Array(Blob)),
          }),
        ),
      ),
    }),
  ),
});
const decodeWorkflow = Schema.decodeUnknownEffect(Schema.fromJsonString(Workflow));

const decodeProblem = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      errors: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(Schema.String))),
    }),
  ),
);

/** Only expose recognized field names, never upstream messages that may echo private input. */
const validationFields = new Set([
  "currencies",
  "prompt",
  "engine",
  "model",
  "operation",
  "version",
  "ecosystem",
  "modelVersion",
  "provider",
  "width",
  "height",
  ...CIVITAI_MODELS.flatMap((model) => Object.values(model.parameterMap)),
]);

const workflowFailureMessage = (workflow: typeof Workflow.Type) => {
  const reasons = new Set(
    workflow.steps.flatMap((step) => step.jobs?.map((job) => job.reason) ?? []),
  );
  if (reasons.has("blocked"))
    return "Civitai blocked this generation during content moderation. Revise the prompt before trying again.";
  if (reasons.has("no_provider_available"))
    return "No Civitai provider is available for this model and its selected options. Choose another model or try again later.";
  if (reasons.has("timeout") || reasons.has("expired"))
    return "Civitai could not finish this generation in time. Try a smaller image count or another model.";
  return `Civitai image generation ${workflow.status}.`;
};

/** Follow Civitai's blob redirect without forwarding credentials to storage hosts. */
const downloadBlob = Effect.fn("Civitai.downloadBlob")(function* (
  client: HttpClient.HttpClient,
  apiKey: string,
  blobUrl: string,
) {
  let target = blobUrl;
  for (let hop = 0; hop <= 5; hop++) {
    const url = yield* Effect.try({
      try: () => new URL(target),
      catch: () => new CivitaiApiError({ message: "Civitai returned an invalid image URL." }),
    });
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port !== "" && url.port !== "443") ||
      NodeNet.isIP(hostname) !== 0 ||
      hostname.startsWith("[") ||
      !hostname.includes(".") ||
      /\.(localhost|local|internal|lan|home|test|invalid)$/.test(hostname)
    ) {
      return yield* new CivitaiApiError({ message: "Civitai returned an unsupported image host." });
    }
    let request = HttpClientRequest.get(url.href);
    if (hop === 0 && url.origin === origin && /^\/v2\/consumer\/blobs\/[^/]+$/.test(url.pathname)) {
      request = HttpClientRequest.bearerToken(request, apiKey);
    }
    const response = yield* client.execute(request).pipe(
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
      Effect.timeout("30 seconds"),
      Effect.mapError(
        () => new CivitaiApiError({ message: "Could not download the generated Civitai image." }),
      ),
    );
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.location;
    if (!location)
      return yield* new CivitaiApiError({
        message: "Civitai image redirect is missing its destination.",
      });
    target = yield* Effect.try({
      try: () => new URL(location, url).href,
      catch: () => new CivitaiApiError({ message: "Civitai returned an invalid image redirect." }),
    });
  }
  return yield* new CivitaiApiError({
    message: "Civitai image download exceeded the redirect limit.",
  });
});

const readBounded = Effect.fn("Civitai.readBounded")(function* (
  response: HttpClientResponse.HttpClientResponse,
  limit: number,
) {
  const result = yield* response.stream.pipe(
    Stream.runFoldEffect(
      () => ({ chunks: [] as Uint8Array[], length: 0 }),
      (state, chunk) => {
        if (state.length + chunk.length > limit) {
          return Effect.fail(
            new CivitaiApiError({ message: "Civitai response exceeds the size limit." }),
          );
        }
        state.chunks.push(chunk);
        state.length += chunk.length;
        return Effect.succeed(state);
      },
    ),
    Effect.timeout("30 seconds"),
    Effect.mapError(
      () =>
        new CivitaiApiError({
          message: "Could not read the Civitai response within the size and time limits.",
        }),
    ),
  );
  return Buffer.concat(result.chunks, result.length);
});

const requestWorkflow = Effect.fn("Civitai.requestWorkflow")(function* (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  hasIdempotencyKey = false,
) {
  let response: HttpClientResponse.HttpClientResponse;
  for (let attempt = 0; ; attempt++) {
    response = yield* client.execute(request).pipe(
      Effect.timeout("75 seconds"),
      Effect.mapError(
        () =>
          new CivitaiApiError({
            message: "Civitai request failed. Check your connection before trying again.",
          }),
      ),
    );
    // Submissions may already be accepted after a 5xx; only retry them with Civitai's externalId.
    const transient = response.status === 429 || response.status >= 500;
    if ((request.method !== "GET" && !hasIdempotencyKey) || !transient || attempt >= 4) break;
    const retryHeader = response.headers["retry-after"] ?? "0";
    const now = yield* Clock.currentTimeMillis;
    const retryAfter = /^\d+$/.test(retryHeader)
      ? Number(retryHeader)
      : (Date.parse(retryHeader) - now) / 1000;
    if (Number.isFinite(retryAfter) && retryAfter > 30) break;
    const jitter = yield* Random.next;
    const delay = Math.min(
      30,
      Math.max(Number.isFinite(retryAfter) ? retryAfter : 0, 2 ** attempt + jitter),
    );
    yield* readBounded(response, 64 * 1024).pipe(Effect.catch(() => Effect.void));
    yield* Effect.sleep(Duration.seconds(delay));
  }
  if (response.status < 200 || response.status >= 300) {
    let invalidFields: string[] = [];
    if (response.status === 400 || response.status === 422) {
      const problem = yield* readBounded(response, 64 * 1024).pipe(
        Effect.flatMap((bytes) => decodeProblem(bytes.toString("utf8"))),
        Effect.orElseSucceed(() => undefined),
      );
      invalidFields = [
        ...new Set(
          Object.keys(problem?.errors ?? {}).flatMap((path) => {
            const field = path.replace(/^(?:\$\.)?steps\[0\]\.input\./, "");
            return validationFields.has(field) ? [field] : [];
          }),
        ),
      ];
    }
    return yield* new CivitaiApiError({
      message:
        response.status === 401
          ? "Civitai rejected the API key. Update it in Settings."
          : response.status === 403
            ? "Civitai denied access to this model or operation. Check your API key permissions and account access."
            : response.status === 402
              ? "Civitai requires sufficient Buzz to generate images."
              : response.status === 400 || response.status === 422
                ? `Civitai rejected the generation settings${invalidFields.length ? ` (${invalidFields.join(", ")})` : ""}. Review the selected model and its options.`
                : response.status === 429
                  ? "Civitai is rate limiting requests. Wait before trying again."
                  : response.status >= 500
                    ? `Civitai is temporarily unable to process this request (HTTP ${response.status}). ${request.method === "POST" ? "The submission may have been accepted; check your Civitai account before generating again." : "Status checks failed after retrying. Check the generation in your Civitai account."}`
                    : `Civitai request failed (HTTP ${response.status}).`,
    });
  }
  const bytes = yield* readBounded(response, 2 * 1024 * 1024);
  return yield* decodeWorkflow(bytes.toString("utf8")).pipe(
    Effect.mapError(
      () => new CivitaiApiError({ message: "Civitai returned an invalid workflow response." }),
    ),
  );
});

/** Reuses one idempotency key for submission retries, then polls the accepted workflow. */
export const generateCivitaiImage = Effect.fn("generateCivitaiImage")(function* (
  client: HttpClient.HttpClient,
  apiKey: string,
  input: ImageGenerationInput,
): Effect.fn.Return<OpenRouterImageGenerationResult, CivitaiApiError> {
  const recipe = CIVITAI_MODELS.find((entry) => entry.id === input.model);
  if (!recipe)
    return yield* new CivitaiApiError({ message: "Select a supported Civitai image model." });
  if (input.inputReferences?.length)
    return yield* new CivitaiApiError({
      message: "These Civitai models support text-to-image generation only.",
    });
  if (
    input.stream === true ||
    input.background !== undefined ||
    input.outputCompression !== undefined ||
    input.provider !== undefined
  ) {
    return yield* new CivitaiApiError({
      message: "Clear unsupported Civitai generation options before generating.",
    });
  }
  if (!input.prompt.trim() || input.prompt.length > recipe.maxPrompt) {
    return yield* new CivitaiApiError({
      message: `This Civitai model requires a prompt of 1–${recipe.maxPrompt} characters.`,
    });
  }
  const parameters: Record<string, unknown> = {
    ...recipe.defaults,
    ...recipe.routing,
    prompt: input.prompt,
  };
  for (const [field, parameter] of inputParameters) {
    const target = recipe.parameterMap[field];
    const value = input[field] ?? (field === "n" && target ? 1 : undefined);
    if (value === undefined) continue;
    const descriptor = recipe.supportedParameters[parameter];
    if (
      !target ||
      !descriptor ||
      descriptor.type === "boolean" ||
      (descriptor.type === "enum" &&
        (typeof value !== "string" || !descriptor.values.includes(value))) ||
      (descriptor.type === "range" &&
        (typeof value !== "number" ||
          !Number.isSafeInteger(value) ||
          value < descriptor.min ||
          value > descriptor.max))
    ) {
      return yield* new CivitaiApiError({
        message: `Unsupported ${parameter} for ${recipe.name}. Choose one of this model's available options.`,
      });
    }
    if (target === "dimensions") {
      const [width, height] = String(value).split("x").map(Number);
      parameters.width = width;
      parameters.height = height;
    } else {
      parameters[target] = value;
    }
  }
  const quantity = input.n ?? 1;
  Object.assign(
    parameters,
    yield* resolveCivitaiOptions(client, apiKey, recipe, input.civitai).pipe(
      Effect.mapError((error) => new CivitaiApiError({ message: error.message })),
    ),
  );
  // The live WorkflowTemplate contract deduplicates by (userId, externalId).
  // Generate once per invocation, outside the retry loop, so a retry cannot create a second job.
  const externalId = yield* Effect.sync(NodeCrypto.randomUUID);
  const workflow = yield* requestWorkflow(
    client,
    HttpClientRequest.post(`${origin}/v2/consumer/workflows?wait=0`).pipe(
      HttpClientRequest.bearerToken(apiKey),
      HttpClientRequest.bodyJsonUnsafe({
        // Required by the live WorkflowTemplate schema; an empty list keeps default Buzz selection.
        currencies: [],
        externalId,
        steps: [
          {
            $type: "imageGen",
            input: parameters,
          },
        ],
      }),
    ),
    true,
  );
  const workflowUrl = `${origin}/v2/consumer/workflows/${encodeURIComponent(workflow.id)}`;
  let terminal = isTerminalStatus(workflow.status);
  const cancel = Effect.gen(function* () {
    if (terminal) return;
    // Best-effort cancellation cannot undo a job already running or guarantee a refund.
    yield* client
      .execute(
        HttpClientRequest.put(workflowUrl).pipe(
          HttpClientRequest.bearerToken(apiKey),
          HttpClientRequest.bodyJsonUnsafe({ status: "canceled" }),
        ),
      )
      .pipe(
        Effect.timeout("10 seconds"),
        Effect.catch(() => Effect.void),
      );
  });
  return yield* Effect.gen(function* () {
    let current = workflow;
    for (let attempt = 0; !terminal && attempt < 30; attempt++) {
      yield* Effect.sleep("2 seconds");
      current = yield* requestWorkflow(
        client,
        HttpClientRequest.get(`${workflowUrl}?wait=15`).pipe(HttpClientRequest.bearerToken(apiKey)),
      );
      terminal = isTerminalStatus(current.status);
    }
    if (current.status !== "succeeded") {
      return yield* new CivitaiApiError({
        message: terminal ? workflowFailureMessage(current) : "Civitai image generation timed out.",
      });
    }
    const blobs = current.steps.flatMap((step) => step.output?.images ?? step.output?.blobs ?? []);
    if (blobs.length !== quantity) {
      return yield* new CivitaiApiError({
        message: "Civitai returned an unexpected number of images.",
      });
    }
    const data = yield* Effect.forEach(blobs, (blob) =>
      Effect.gen(function* () {
        const blobUrl = blob.url;
        if (!blob.available || !blobUrl) {
          return yield* new CivitaiApiError({
            message:
              "Civitai completed the workflow but an image is unavailable or withheld. Check the workflow in your Civitai account.",
          });
        }
        let response = yield* downloadBlob(client, apiKey, blobUrl);
        // Refresh expired signed URLs once without resubmitting the paid workflow.
        if ([401, 403, 404].includes(response.status) && blob.id) {
          const refreshed = yield* requestWorkflow(
            client,
            HttpClientRequest.get(workflowUrl).pipe(HttpClientRequest.bearerToken(apiKey)),
          );
          const freshBlob = refreshed.steps
            .flatMap((step) => step.output?.images ?? step.output?.blobs ?? [])
            .find((candidate) => candidate.id === blob.id);
          if (freshBlob?.available && freshBlob.url) {
            response = yield* downloadBlob(client, apiKey, freshBlob.url);
          }
        }
        if (response.status !== 200)
          return yield* new CivitaiApiError({
            message: `Civitai image download failed (HTTP ${response.status}).`,
          });
        const bytes = yield* readBounded(response, 20 * 1024 * 1024);
        const mediaType = detectOpenRouterImageMimeType(bytes);
        if (!mediaType)
          return yield* new CivitaiApiError({
            message: "Civitai returned an unsupported image format.",
          });
        return { b64Json: bytes.toString("base64"), mediaType };
      }),
    );
    return { data };
  }).pipe(
    Effect.timeout("10 minutes"),
    Effect.mapError((error) =>
      isCivitaiApiError(error)
        ? error
        : new CivitaiApiError({ message: "Civitai image generation timed out." }),
    ),
    Effect.ensuring(cancel),
  );
});
