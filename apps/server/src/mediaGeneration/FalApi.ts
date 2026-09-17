import {
  type ImageGenerationInput,
  type VideoGenerationInput,
  videoGenerationInputError,
} from "@t3tools/contracts";
import { Effect, Schedule, Schema, Stream } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/unstable/http";
import {
  detectOpenRouterImageMimeType,
  type OpenRouterImageGenerationResult,
  type OpenRouterVideoJob,
} from "../provider/Layers/OpenRouterApi.ts";
import { CivitaiResourceError, resolveFalCivitaiLoras } from "../imageGeneration/CivitaiResources.ts";
import { FAL_IMAGE_MODELS, FAL_VIDEO_MODELS, falImageRoute, falVideoRoute } from "./FalModels.ts";

export class FalApiError extends Schema.TaggedErrorClass<FalApiError>()("FalApiError", {
  message: Schema.String,
  status: Schema.optionalKey(Schema.Number),
}) {}

const origin = "https://queue.fal.run";
const QueueSubmission = Schema.Struct({
  request_id: Schema.String,
  status_url: Schema.String,
  response_url: Schema.String,
  cancel_url: Schema.String,
});
const QueueStatus = Schema.Struct({
  status: Schema.Literals(["IN_QUEUE", "IN_PROGRESS", "COMPLETED"]),
  response_url: Schema.String,
  error: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
const ImageResult = Schema.Struct({ images: Schema.Array(Schema.Struct({ url: Schema.String })) });
const VideoResult = Schema.Struct({ video: Schema.Struct({ url: Schema.String }) });
const decodeSubmission = Schema.decodeUnknownEffect(Schema.fromJsonString(QueueSubmission));
const decodeStatus = Schema.decodeUnknownEffect(Schema.fromJsonString(QueueStatus));
const decodeImages = Schema.decodeUnknownEffect(Schema.fromJsonString(ImageResult));
const decodeVideo = Schema.decodeUnknownEffect(Schema.fromJsonString(VideoResult));
const isFalApiError = Schema.is(FalApiError);

const retryImageRead = <A>(operation: Effect.Effect<A, FalApiError>) =>
  operation.pipe(
    Effect.retry({
      times: 2,
      schedule: Schedule.exponential("1 second"),
      while: (error) => error.status === 429 || (error.status !== undefined && error.status >= 500),
    }),
  );

function queueUrl(value: string): string {
  const url = new URL(value);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !url.pathname.includes("/requests/")
  ) {
    throw new Error("Invalid fal queue URL");
  }
  return url.href;
}

/** References are passed through unchanged: local component uploads already use data URLs. */
function referenceUrl(value: string): string {
  if (
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) &&
    value.length <= 28 * 1024 * 1024
  )
    return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return value;
  } catch {
    /* Report a stable validation error below. */
  }
  throw new FalApiError({
    message:
      "fal references must be HTTPS image URLs or PNG, JPEG, or WebP data URLs (up to 20 MB).",
  });
}

export function falImageRequest(input: ImageGenerationInput) {
  const model = FAL_IMAGE_MODELS.find((entry) => entry.id === input.model);
  const route = falImageRoute(input.model);
  if (!model || !route) throw new FalApiError({ message: "Choose a supported fal image model." });
  if (
    input.stream ||
    input.provider !== undefined ||
    input.background !== undefined ||
    input.outputCompression !== undefined
  ) {
    throw new FalApiError({ message: "Clear unsupported fal image generation options." });
  }
  if (input.civitai !== undefined && !model.civitai) {
    throw new FalApiError({ message: "This fal model does not accept Civitai LoRAs." });
  }
  if (input.civitai?.checkpoint) {
    throw new FalApiError({ message: "This fal model does not support a checkpoint override." });
  }
  if (input.prompt.trim().length < route.minPrompt || input.prompt.length > route.maxPrompt) {
    throw new FalApiError({
      message: `This fal model requires a prompt of ${route.minPrompt}–${route.maxPrompt} characters.`,
    });
  }
  const references = input.inputReferences ?? [];
  if (references.length > route.maxReferences) {
    throw new FalApiError({
      message:
        route.maxReferences === 0
          ? "This fal model does not accept reference images."
          : `Use at most ${route.maxReferences} reference images with this fal model.`,
    });
  }
  if (references.length && !route.editEndpoint) {
    throw new FalApiError({ message: "This fal model does not accept reference images." });
  }
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    ...(model.supportedParameters.n ? { num_images: input.n ?? 1 } : {}),
    ...(route.safety === "tolerance"
      ? { safety_tolerance: route.safetyTolerance }
      : route.safety === "checker_and_tolerance"
        ? {
            enable_safety_checker: false,
            safety_tolerance: route.safetyTolerance,
          }
        : { enable_safety_checker: false }),
  };
  for (const [field, descriptorKey, parameter] of [
    ["n", "n", "num_images"],
    ["seed", "seed", "seed"],
    ["size", "size", "image_size"],
    ["aspectRatio", "aspect_ratio", "aspect_ratio"],
    ["resolution", "resolution", "resolution"],
    ["quality", "quality", "quality"],
    ["outputFormat", "output_format", "output_format"],
  ] as const) {
    const value = input[field];
    if (value === undefined) continue;
    const descriptor = model.supportedParameters[descriptorKey];
    if (
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
      throw new FalApiError({ message: `Unsupported ${descriptorKey} for ${model.name}.` });
    }
    body[parameter] = value;
  }
  const civitai = input.civitai;
  const capabilities = model.civitai;
  if (civitai && capabilities) {
    const loras = civitai.loras ?? [];
    if (
      loras.length > capabilities.maxLoras ||
      new Set(loras.map((lora) => lora.air)).size !== loras.length
    ) {
      throw new FalApiError({
        message: `Use up to ${capabilities.maxLoras} distinct LoRAs.`,
      });
    }
    if (civitai.negativePrompt !== undefined) {
      if (!capabilities.negativePrompt || civitai.negativePrompt.length > 10000)
        throw new FalApiError({ message: "This fal model does not support the supplied negative prompt." });
      body.negative_prompt = civitai.negativePrompt;
    }
    if (civitai.steps !== undefined) {
      if (
        !capabilities.steps ||
        !Number.isInteger(civitai.steps) ||
        civitai.steps < capabilities.steps.min ||
        civitai.steps > capabilities.steps.max
      )
        throw new FalApiError({ message: "Invalid steps for this fal model." });
      body.num_inference_steps = civitai.steps;
    }
    if (civitai.cfgScale !== undefined) {
      if (
        !capabilities.cfgScale ||
        !Number.isFinite(civitai.cfgScale) ||
        civitai.cfgScale < capabilities.cfgScale.min ||
        civitai.cfgScale > capabilities.cfgScale.max
      )
        throw new FalApiError({ message: "Invalid cfgScale for this fal model." });
      body.guidance_scale = civitai.cfgScale;
    }
  }
  if (references.length)
    body.image_urls = references.map((reference) => referenceUrl(reference.url));
  return {
    endpoint: references.length ? route.editEndpoint! : route.endpoint,
    body,
  };
}

export function falVideoRequest(input: VideoGenerationInput) {
  const model = FAL_VIDEO_MODELS.find((entry) => entry.id === input.model);
  const route = falVideoRoute(input.model);
  if (!model || !route) throw new FalApiError({ message: "Choose a supported fal video model." });
  const error = videoGenerationInputError(input, model);
  if (error) throw new FalApiError({ message: error });
  if (input.prompt.trim().length < route.minPrompt || input.prompt.length > route.maxPrompt) {
    throw new FalApiError({
      message: `This fal model requires a prompt of ${route.minPrompt}–${route.maxPrompt} characters.`,
    });
  }
  if (
    input.inputReferences?.length ||
    input.provider !== undefined ||
    input.callbackUrl !== undefined
  ) {
    throw new FalApiError({
      message:
        "Use a first-frame image for fal image-to-video. Reference assets, provider options, and callbacks are not supported here.",
    });
  }
  const first = input.frameImages?.find((frame) => frame.frameType === "first_frame");
  const last = input.frameImages?.find((frame) => frame.frameType === "last_frame");
  return {
    endpoint: route.endpoint,
    body: {
      prompt: input.prompt,
      ...(route.safetyChecker ? { enable_safety_checker: false } : {}),
      ...(input.duration !== undefined ? { duration: String(input.duration) } : {}),
      ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
      ...(input.aspectRatio !== undefined ? { aspect_ratio: input.aspectRatio } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(model.generateAudio && input.generateAudio !== undefined
        ? { generate_audio: input.generateAudio }
        : {}),
      ...(first && route.firstFrameField
        ? { [route.firstFrameField]: referenceUrl(first.url) }
        : {}),
      ...(last && route.lastFrameField ? { [route.lastFrameField]: referenceUrl(last.url) } : {}),
    },
  };
}

const readBounded = Effect.fn("fal.readBounded")(function* (
  response: HttpClientResponse.HttpClientResponse,
  limit: number,
) {
  const result = yield* response.stream.pipe(
    Stream.runFoldEffect(
      () => ({ chunks: [] as Uint8Array[], length: 0 }),
      (state, chunk) => {
        if (state.length + chunk.length > limit)
          return Effect.fail(new FalApiError({ message: "fal response exceeds the size limit." }));
        state.chunks.push(chunk);
        state.length += chunk.length;
        return Effect.succeed(state);
      },
    ),
    Effect.timeout("2 minutes"),
    Effect.mapError(
      () =>
        new FalApiError({
          message: "Could not read the fal response within the size and time limits.",
        }),
    ),
  );
  return Buffer.concat(result.chunks, result.length);
});

const request = Effect.fn("fal.request")(function* (
  client: HttpClient.HttpClient,
  apiKey: string,
  req: HttpClientRequest.HttpClientRequest,
) {
  const response = yield* client
    .execute(req.pipe(HttpClientRequest.setHeader("Authorization", `Key ${apiKey}`)))
    .pipe(
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
      Effect.timeout("60 seconds"),
      Effect.mapError(
        () =>
          new FalApiError({
            message:
              "fal request failed. A submission may already have been accepted; check your fal dashboard before resubmitting.",
          }),
      ),
    );
  if (response.status < 200 || response.status >= 300)
    return yield* new FalApiError({
      status: response.status,
      message:
        response.status === 401 || response.status === 403
          ? "fal rejected the API key or access. Check Settings > Providers and your fal account."
          : response.status === 402
            ? "Your fal account needs credits to generate media."
            : response.status === 422 || response.status === 400
              ? "fal rejected the generation settings or content. Review the model options and prompt."
              : response.status === 429
                ? "fal is rate limiting requests. Try again later."
                : `fal request failed (HTTP ${response.status}). Check your fal dashboard before resubmitting.`,
    });
  return (yield* readBounded(response, 2 * 1024 * 1024)).toString("utf8");
});

const safeError = (error: unknown) =>
  isFalApiError(error) ? error : new FalApiError({ message: "fal returned an invalid response." });
const checkedQueueUrl = (url: string) => Effect.try({ try: () => queueUrl(url), catch: safeError });

const submit = Effect.fn("fal.submit")(function* (
  client: HttpClient.HttpClient,
  key: string,
  input: { endpoint: string; body: object },
) {
  const job = yield* request(
    client,
    key,
    HttpClientRequest.post(`${origin}/${input.endpoint}`).pipe(
      HttpClientRequest.bodyJsonUnsafe(input.body),
    ),
  ).pipe(Effect.flatMap(decodeSubmission), Effect.mapError(safeError));
  yield* checkedQueueUrl(job.status_url);
  yield* checkedQueueUrl(job.response_url);
  yield* checkedQueueUrl(job.cancel_url);
  return job;
});

const status = Effect.fn("fal.status")(function* (
  client: HttpClient.HttpClient,
  key: string,
  statusUrl: string,
) {
  const url = yield* checkedQueueUrl(statusUrl);
  return yield* request(client, key, HttpClientRequest.get(url)).pipe(
    Effect.flatMap(decodeStatus),
    Effect.mapError(safeError),
  );
});

/** Downloads only fal storage media, with no API credential and no automatic redirects. */
export const downloadFalMedia = Effect.fn("fal.downloadMedia")(function* (
  client: HttpClient.HttpClient,
  value: string,
  video: boolean,
) {
  const url = yield* Effect.try({ try: () => new URL(value), catch: safeError });
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !(url.hostname === "fal.media" || url.hostname.endsWith(".fal.media"))
  ) {
    return yield* new FalApiError({ message: "fal returned an unsupported media host." });
  }
  const response = yield* client
    .execute(HttpClientRequest.get(url.href))
    .pipe(
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
      Effect.timeout("60 seconds"),
      Effect.mapError(safeError),
    );
  if (response.status !== 200)
    return yield* new FalApiError({
      message: "Could not download the generated fal media.",
      status: response.status,
    });
  const bytes = yield* readBounded(response, (video ? 250 : 20) * 1024 * 1024);
  const mediaType = video
    ? bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp"
      ? "video/mp4"
      : undefined
    : detectOpenRouterImageMimeType(bytes);
  if (!mediaType)
    return yield* new FalApiError({ message: "fal returned an unsupported media format." });
  return { bytes, mediaType };
});

export const generateFalImage = Effect.fn("fal.generateImage")(function* (
  client: HttpClient.HttpClient,
  key: string,
  input: ImageGenerationInput,
  civitaiApiKey?: string,
): Effect.fn.Return<OpenRouterImageGenerationResult, FalApiError> {
  const payload = yield* Effect.try({ try: () => falImageRequest(input), catch: safeError });
  const route = falImageRoute(input.model);
  if (input.civitai?.loras?.length) {
    if (!civitaiApiKey)
      return yield* new FalApiError({
        message: "Configure and enable a Civitai API key in Settings > Providers to use LoRAs.",
      });
    if (!route?.lora)
      return yield* new FalApiError({ message: "This fal model does not accept Civitai LoRAs." });
    const loras = yield* resolveFalCivitaiLoras(
      client,
      civitaiApiKey,
      input.model,
      input.civitai,
      route.lora,
    ).pipe(
      Effect.mapError((error) =>
        error instanceof CivitaiResourceError
          ? new FalApiError({ message: error.message })
          : new FalApiError({ message: "Could not resolve Civitai LoRAs." }),
      ),
    );
    payload.body.loras = loras;
  }
  const job = yield* submit(client, key, payload);
  let completed = false;
  return yield* Effect.gen(function* () {
    for (let attempt = 0; attempt < 120; attempt++) {
      const current = yield* retryImageRead(status(client, key, job.status_url));
      if (current.status !== "COMPLETED") {
        yield* Effect.sleep("3 seconds");
        continue;
      }
      completed = true;
      if (current.error)
        return yield* new FalApiError({
          message:
            "fal could not complete this image generation. Check the request in your fal dashboard.",
        });
      const resultUrl = yield* checkedQueueUrl(current.response_url);
      const result = yield* retryImageRead(
        request(client, key, HttpClientRequest.get(resultUrl)),
      ).pipe(Effect.flatMap(decodeImages), Effect.mapError(safeError));
      if (result.images.length !== (input.n ?? 1))
        return yield* new FalApiError({
          message: "fal returned an unexpected image count; some outputs may have been withheld.",
        });
      const data = yield* Effect.forEach(result.images, (image) =>
        retryImageRead(downloadFalMedia(client, image.url, false)).pipe(
          Effect.map(({ bytes, mediaType }) => ({ b64Json: bytes.toString("base64"), mediaType })),
        ),
      );
      return { data };
    }
    return yield* new FalApiError({
      message: "fal image generation timed out. Check your fal dashboard.",
    });
  }).pipe(
    Effect.timeout("10 minutes"),
    Effect.mapError((error) =>
      isFalApiError(error)
        ? error
        : new FalApiError({ message: "fal image generation timed out. Check your fal dashboard." }),
    ),
    Effect.ensuring(
      Effect.suspend(() =>
        completed
          ? Effect.void
          : // Best-effort cancellation cannot undo processing that has already started.
            request(client, key, HttpClientRequest.put(job.cancel_url)).pipe(
              Effect.timeout("10 seconds"),
              Effect.catch(() => Effect.void),
              Effect.asVoid,
            ),
      ),
    ),
  );
});

export const createFalVideo = Effect.fn("fal.createVideo")(function* (
  client: HttpClient.HttpClient,
  key: string,
  input: VideoGenerationInput,
): Effect.fn.Return<OpenRouterVideoJob, FalApiError> {
  const payload = yield* Effect.try({ try: () => falVideoRequest(input), catch: safeError });
  const job = yield* submit(client, key, payload);
  return { id: job.request_id, status: "pending", pollingUrl: job.status_url };
});

/** Persist and reuse fal's status URL; endpoint subpaths must not be guessed on recovery. */
export const fetchFalVideoJob = Effect.fn("fal.fetchVideoJob")(function* (
  client: HttpClient.HttpClient,
  key: string,
  jobId: string,
  pollingUrl: string,
): Effect.fn.Return<OpenRouterVideoJob, FalApiError> {
  const current = yield* status(client, key, pollingUrl);
  if (current.status !== "COMPLETED")
    return { id: jobId, status: current.status === "IN_QUEUE" ? "pending" : "in_progress" };
  if (current.error)
    return {
      id: jobId,
      status: "failed",
      error: "fal could not complete this video generation. Check your fal dashboard.",
    };
  const url = yield* checkedQueueUrl(current.response_url);
  const result = yield* request(client, key, HttpClientRequest.get(url)).pipe(
    Effect.flatMap(decodeVideo),
    Effect.mapError(safeError),
  );
  return { id: jobId, status: "completed", unsignedUrls: [result.video.url] };
});
