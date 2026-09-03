import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import {
  mergeOpenRouterImageCapabilities,
  fetchOpenRouterImageModelEndpoints,
  fetchOpenRouterVideoJob,
  downloadOpenRouterVideo,
  createOpenRouterVideo,
  generateOpenRouterImage,
  normalizeOpenRouterImageMimeType,
  resolveOpenRouterImageMimeType,
  parseOpenRouterImageModels,
  parseOpenRouterModels,
  parseOpenRouterVideoModels,
  resolveOpenRouterImageCapabilities,
  sanitizeOpenRouterImageInput,
  streamOpenRouterCompletion,
  createOpenRouterEmbeddings,
  openRouterWebSearchRequestCount,
} from "./OpenRouterApi.ts";

describe("OpenRouter server-tool usage", () => {
  it("reads valid web-search request counts and ignores malformed usage", () => {
    expect(
      openRouterWebSearchRequestCount({
        server_tool_use: { web_search_requests: 3 },
      }),
    ).toBe(3);
    expect(
      openRouterWebSearchRequestCount({ server_tool_use: { web_search_requests: 0 } }),
    ).toBe(0);
    expect(
      openRouterWebSearchRequestCount({ server_tool_use: { web_search_requests: 1.5 } }),
    ).toBe(0);
    expect(openRouterWebSearchRequestCount(undefined)).toBe(0);
  });
});

it.effect("creates embeddings with the OpenRouter embeddings endpoint", () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = HttpClient.make((request) => {
    const body = request.body as { readonly body?: Uint8Array };
    if (body.body) {
      requestBody = JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>;
    }
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        Response.json({
          data: [
            { embedding: [0.1, 0.2], index: 0 },
            { embedding: [0.3, 0.4], index: 1 },
          ],
        }),
      ),
    );
  });

  return createOpenRouterEmbeddings({
    httpClient: client,
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "test-key",
    model: "openai/text-embedding-3-small",
    inputs: ["first", "second"],
  }).pipe(
    Effect.map((embeddings) => {
      expect(requestBody).toEqual({
        model: "openai/text-embedding-3-small",
        input: ["first", "second"],
      });
      expect(embeddings).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
    }),
  );
});

describe("parseOpenRouterModels", () => {
  it("keeps valid OpenRouter model IDs and ignores malformed entries", () => {
    const models = parseOpenRouterModels({
      data: [
        { id: "openai/gpt-4o-mini", name: "GPT-4o mini", context_length: 128000 },
        { id: " anthropic/claude-3.7-sonnet " },
        { name: "missing id" },
        null,
      ],
    });

    expect(models).toEqual([
      { id: "openai/gpt-4o-mini", name: "GPT-4o mini", contextLength: 128000 },
      { id: "anthropic/claude-3.7-sonnet" },
    ]);
  });

  it("preserves tool, reasoning, and modality metadata while ignoring malformed values", () => {
    expect(
      parseOpenRouterModels({
        data: [
          {
            id: "reasoning/model",
            supported_parameters: ["tools", "tool_choice", 42, ""],
            reasoning: { supported: true, max_tokens: 4096 },
            architecture: { input_modalities: ["text", 1], output_modalities: ["text"] },
          },
        ],
      }),
    ).toEqual([
      {
        id: "reasoning/model",
        supportedParameters: ["tools", "tool_choice"],
        reasoning: { supported: true, maxTokens: 4096 },
        inputModalities: ["text"],
        outputModalities: ["text"],
      },
    ]);
  });

  it("returns an empty catalog for an unexpected response", () => {
    expect(parseOpenRouterModels({ data: "not-an-array" })).toEqual([]);
    expect(parseOpenRouterModels(null)).toEqual([]);
  });

  it("recognizes the current OpenRouter reasoning metadata shape", () => {
    expect(
      parseOpenRouterModels({
        data: [
          {
            id: "deepseek/deepseek-v4-flash-vision-exp",
            architecture: { input_modalities: ["text", "image"] },
            reasoning: {
              mandatory: false,
              default_enabled: true,
              default_effort: "high",
              supported_efforts: ["low", "high"],
              supports_max_tokens: true,
            },
          },
        ],
      }),
    ).toEqual([
      {
        id: "deepseek/deepseek-v4-flash-vision-exp",
        reasoning: {
          supported: true,
          supportedEfforts: ["low", "high"],
          defaultEffort: "high",
          defaultEnabled: true,
          mandatory: false,
          supportsMaxTokens: true,
        },
        inputModalities: ["text", "image"],
      },
    ]);
  });

  it("normalizes supported OpenRouter image MIME types", () => {
    expect(normalizeOpenRouterImageMimeType("image/jpg")).toBe("image/jpeg");
    expect(normalizeOpenRouterImageMimeType("IMAGE/PNG")).toBe("image/png");
    expect(normalizeOpenRouterImageMimeType("image/svg+xml")).toBe("image/svg+xml");
  });

  it("parses image model capabilities from the OpenRouter image catalog", () => {
    expect(
      parseOpenRouterImageModels({
        data: [
          {
            id: "openai/gpt-image-1",
            name: "GPT Image 1",
            architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
            supported_parameters: {
              quality: { type: "enum", values: ["low", "high"] },
              output_format: { type: "enum", values: ["png", "webp"] },
              background: { type: "boolean" },
            },
            supports_streaming: true,
          },
        ],
      }),
    ).toEqual([
      {
        id: "openai/gpt-image-1",
        name: "GPT Image 1",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        imageGeneration: {
          supportedParameters: {
            quality: { type: "enum", values: ["low", "high"] },
            output_format: { type: "enum", values: ["png", "webp"] },
            background: { type: "boolean" },
          },
          supportsStreaming: true,
        },
      },
    ]);
  });

  it.effect("loads provider endpoints using the encoded model path", () => {
    let requestedUrl = "";
    const client = HttpClient.make((request) => {
      requestedUrl = request.url;
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              id: "openai/gpt-image-1",
              endpoints: [
                {
                  provider_name: "OpenAI",
                  provider_slug: "openai",
                  allowed_passthrough_parameters: ["quality"],
                  supported_parameters: { quality: { type: "enum", values: ["low", "high"] } },
                  supports_streaming: false,
                  pricing: [{ billable: "image", unit: "image", cost_usd: 0.04 }],
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      );
    });

    return fetchOpenRouterImageModelEndpoints(
      client,
      "https://openrouter.ai/api/v1",
      "test-key",
      "openai/gpt-image-1",
    ).pipe(
      Effect.map((result) => {
        expect(requestedUrl).toBe(
          "https://openrouter.ai/api/v1/images/models/openai/gpt-image-1/endpoints",
        );
        expect(result.endpoints[0]?.pricing[0]?.costUsd).toBe(0.04);
      }),
    );
  });

  it.effect("sends the image-generation options using OpenRouter field names", () => {
    let requestBody: Record<string, unknown> | undefined;
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body) {
        requestBody = JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>;
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              data: [{ b64_json: "AQID", media_type: "image/png", revised_prompt: "revised" }],
              usage: { images: 1 },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      );
    });

    return generateOpenRouterImage({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "openai/gpt-image-1",
      prompt: "A quiet studio",
      n: 2,
      resolution: "1K",
      aspectRatio: "16:9",
      size: "1536x1024",
      quality: "high",
      outputFormat: "webp",
      background: "transparent",
      outputCompression: 80,
      seed: 42,
      inputReferences: [{ type: "image_url", image_url: { url: "data:image/png;base64,AQID" } }],
      provider: { order: ["openai"] },
    }).pipe(
      Effect.map((result) => {
        expect(requestBody).toMatchObject({
          model: "openai/gpt-image-1",
          prompt: "A quiet studio",
          n: 2,
          resolution: "1K",
          aspect_ratio: "16:9",
          size: "1536x1024",
          quality: "high",
          output_format: "webp",
          background: "transparent",
          output_compression: 80,
          seed: 42,
          input_references: [{ type: "image_url" }],
          provider: { order: ["openai"] },
        });
        expect(result.data[0]?.b64Json).toBe("AQID");
      }),
    );
  });

  it.effect("sends the provider routing object unchanged", () => {
    let requestBody: Record<string, unknown> | undefined;
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body) {
        requestBody = JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>;
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify({ data: [{ b64_json: "AQID" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
    });

    return generateOpenRouterImage({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "openai/gpt-image-2",
      prompt: "A quiet studio",
      provider: { order: ["some-other-provider"], allow_fallbacks: true },
    }).pipe(
      Effect.map(() => {
        expect(requestBody?.provider).toEqual({
          order: ["some-other-provider"],
          allow_fallbacks: true,
        });
      }),
    );
  });

  it.effect("uses a buffered response for Muse Image", () => {
    let requestBody: Record<string, unknown> | undefined;
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body) {
        requestBody = JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>;
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify({ data: [{ b64_json: "AQID" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
    });

    return generateOpenRouterImage({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "meta/muse-image",
      prompt: "A quiet studio",
      stream: true,
      n: 2,
      outputFormat: "webp",
    }).pipe(
      Effect.map((result) => {
        expect(requestBody).toEqual({ model: "meta/muse-image", prompt: "A quiet studio" });
        expect(result.data[0]?.b64Json).toBe("AQID");
      }),
    );
  });

  it("resolves omitted image MIME types from returned bytes", () => {
    expect(
      resolveOpenRouterImageMimeType(
        undefined,
        Uint8Array.from([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe("image/webp");
    expect(resolveOpenRouterImageMimeType("image/png", Uint8Array.from([0xff, 0xd8, 0xff]))).toBe(
      "image/jpeg",
    );
  });

  it.effect("collects the completed image from streaming image-generation events", () => {
    let requestBody: Record<string, unknown> | undefined;
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body) {
        requestBody = JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>;
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            [
              'data: {"type":"image_generation.partial_image","partial_image_index":0,"b64_json":"cGFydGlhbA=="}',
              'data: {"type":"image_generation.completed","b64_json":"AQID","media_type":"image/svg+xml","usage":{"cost":0.01}}',
              "data: [DONE]",
              "",
            ].join("\n"),
            { status: 200, headers: { "content-type": "text/event-stream" } },
          ),
        ),
      );
    });

    return generateOpenRouterImage({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "recraft/vector",
      prompt: "A geometric flower",
      stream: true,
    }).pipe(
      Effect.map((result) => {
        expect(requestBody).toMatchObject({ stream: true });
        expect(result.data).toEqual([{ b64Json: "AQID", mediaType: "image/svg+xml" }]);
        expect(result.usage).toEqual({ cost: 0.01 });
      }),
    );
  });
});

describe("OpenRouter chat completion routing", () => {
  it.effect("routes GLM-5.3 Flash tool calls through BaseTen", () => {
    let requestBody: Record<string, unknown> | undefined;
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body) {
        requestBody = JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>;
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response("data: [DONE]\n", {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        ),
      );
    });

    return streamOpenRouterCompletion({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "z-ai/glm-5.3-flash",
      messages: [{ role: "user", content: "Hello" }],
      tools: [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read a file.",
            parameters: { type: "object" },
          },
        },
      ],
      modelCapabilities: {
        supportedParameters: ["tools", "tool_choice", "reasoning", "reasoning_effort"],
        reasoning: {
          supported: true,
          mandatory: true,
          defaultEffort: "max",
          supportedEfforts: ["max", "high", "low"],
        },
      },
      modelOptions: [{ id: "reasoningEffort", value: "max" }],
    }).pipe(
      Effect.flatMap(Stream.runCollect),
      Effect.map(() => {
        expect(requestBody).toMatchObject({
          model: "z-ai/glm-5.3-flash",
          provider: { order: ["baseten"], require_parameters: true },
          reasoning_effort: "max",
        });
        expect(requestBody?.provider).not.toHaveProperty("sort");
        expect(requestBody).not.toHaveProperty("parallel_tool_calls");
        expect(requestBody).not.toHaveProperty("max_tool_calls");
      }),
    );
  });
});

describe("OpenRouter image generation capability handling", () => {
  const baseInput = {
    httpClient: HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify({ data: [{ b64_json: "AQID" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    ),
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "test-key",
    model: "x-ai/grok-imagine-image-2.0",
    prompt: "A red panda",
  } as const;

  it("drops fields the model does not support", () => {
    const sanitized = sanitizeOpenRouterImageInput(
      {
        ...baseInput,
        n: 2,
        background: "transparent",
        stream: true,
        seed: 7,
        aspectRatio: "1:1",
      },
      {
        supportedParameters: {
          aspect_ratio: { type: "enum", values: ["1:1"] },
        },
        supportsStreaming: false,
      },
    );

    expect(sanitized.n).toBeUndefined();
    expect(sanitized.background).toBeUndefined();
    expect(sanitized.stream).toBeUndefined();
    expect(sanitized.seed).toBeUndefined();
    expect(sanitized.aspectRatio).toBe("1:1");
  });

  it("remaps enum values the model does not accept", () => {
    const sanitized = sanitizeOpenRouterImageInput(
      { ...baseInput, quality: "auto", outputFormat: "png" },
      {
        supportedParameters: {
          quality: { type: "enum", values: ["low", "medium"] },
          output_format: { type: "enum", values: ["svg"] },
        },
        supportsStreaming: false,
      },
    );

    expect(sanitized.quality).toBe("low");
    expect(sanitized.outputFormat).toBe("svg");
  });

  it("clamps numeric fields into the model's ranges", () => {
    const sanitized = sanitizeOpenRouterImageInput(
      { ...baseInput, n: 8, outputCompression: 150 },
      {
        supportedParameters: {
          n: { type: "range", min: 1, max: 1 },
          output_compression: { type: "range", min: 0, max: 100 },
        },
        supportsStreaming: false,
      },
    );

    expect(sanitized.n).toBe(1);
    expect(sanitized.outputCompression).toBe(100);
  });

  it("drops resolution when an explicit size is authoritative", () => {
    const sanitized = sanitizeOpenRouterImageInput(
      { ...baseInput, resolution: "1K", size: "2048x2048" },
      {
        supportedParameters: {
          resolution: { type: "enum", values: ["1K", "2K"] },
          size: { type: "enum", values: ["2048x2048"] },
        },
        supportsStreaming: false,
      },
    );

    expect(sanitized.size).toBe("2048x2048");
    expect(sanitized.resolution).toBeUndefined();
  });

  it("requires reference images when the endpoint minimum is greater than zero", () => {
    expect(() =>
      sanitizeOpenRouterImageInput(
        { ...baseInput, inputReferences: [] },
        {
          supportedParameters: {
            input_references: { type: "range", min: 1, max: 10 },
          },
          supportsStreaming: false,
        },
      ),
    ).toThrow("requires at least 1 reference image");

    const sanitized = sanitizeOpenRouterImageInput(
      {
        ...baseInput,
        inputReferences: [{ type: "image_url", image_url: { url: "data:image/png;base64,AQID" } }],
      },
      {
        supportedParameters: {
          input_references: { type: "range", min: 1, max: 10 },
        },
        supportsStreaming: false,
      },
    );

    expect(sanitized.inputReferences).toHaveLength(1);
  });

  it("rejects more references than the endpoint accepts", () => {
    const references = [
      { type: "image_url" as const, image_url: { url: "data:image/png;base64,AQID" } },
      { type: "image_url" as const, image_url: { url: "data:image/png;base64,AQID" } },
    ];

    expect(() =>
      sanitizeOpenRouterImageInput(
        { ...baseInput, inputReferences: references },
        {
          supportedParameters: {
            input_references: { type: "range", min: 0, max: 1 },
          },
          supportsStreaming: false,
        },
      ),
    ).toThrow("accepts at most 1 reference image");
  });

  it("intersects capabilities across endpoints for automatic routing", () => {
    const capabilities = mergeOpenRouterImageCapabilities([
      {
        providerName: "OpenAI",
        providerSlug: "openai",
        supportedParameters: {
          quality: { type: "enum", values: ["auto", "low", "high"] },
          n: { type: "range", min: 1, max: 10 },
        },
        allowedPassthroughParameters: [],
        supportsStreaming: true,
        pricing: [],
      },
      {
        providerName: "Second",
        providerSlug: "second",
        supportedParameters: {
          quality: { type: "enum", values: ["low", "medium"] },
          n: { type: "range", min: 1, max: 4 },
        },
        allowedPassthroughParameters: [],
        supportsStreaming: false,
        pricing: [],
      },
    ]);

    expect(capabilities.supportsStreaming).toBe(false);
    expect(capabilities.supportedParameters.quality).toEqual({
      type: "enum",
      values: ["low"],
    });
    expect(capabilities.supportedParameters.n).toEqual({
      type: "range",
      min: 1,
      max: 4,
    });
  });

  it("uses the pinned endpoint's capabilities when a provider is selected", () => {
    const capabilities = resolveOpenRouterImageCapabilities(
      {
        id: "openai/gpt-image-1",
        endpoints: [
          {
            providerName: "OpenAI",
            providerSlug: "openai",
            providerTag: "openai",
            supportedParameters: {
              quality: { type: "enum", values: ["auto", "high"] },
            },
            allowedPassthroughParameters: [],
            supportsStreaming: true,
            pricing: [],
          },
          {
            providerName: "Other",
            providerSlug: "other",
            providerTag: "other",
            supportedParameters: {
              quality: { type: "enum", values: ["low"] },
            },
            allowedPassthroughParameters: [],
            supportsStreaming: false,
            pricing: [],
          },
        ],
      },
      { only: ["other"], allow_fallbacks: false },
    );

    expect(capabilities.supportsStreaming).toBe(false);
    expect(capabilities.supportedParameters.quality).toEqual({
      type: "enum",
      values: ["low"],
    });
  });
});

describe("OpenRouter video generation", () => {
  it("parses video model capabilities from the video catalog", () => {
    expect(
      parseOpenRouterVideoModels({
        data: [
          {
            id: "google/veo-3.1",
            canonical_slug: "google/veo-3.1",
            name: "Veo 3.1",
            generate_audio: true,
            seed: true,
            supported_durations: [4, 8],
            supported_resolutions: ["720p", "1080p"],
            supported_aspect_ratios: ["16:9"],
            supported_frame_images: ["first_frame", "last_frame"],
            supported_sizes: ["1280x720"],
            allowed_passthrough_parameters: ["enhancePrompt"],
            pricing_skus: { video: { price: 0.1 } },
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        id: "google/veo-3.1",
        generateAudio: true,
        supportsSeed: true,
        supportedDurations: [4, 8],
        supportedFrameImages: ["first_frame", "last_frame"],
        allowedPassthroughParameters: ["enhancePrompt"],
      }),
    ]);
  });

  it.effect("sends text, frame, reference, provider, and callback options", () => {
    let requestBody: Record<string, unknown> | undefined;
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body) {
        requestBody = JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>;
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify({ id: "job-1", status: "pending", polling_url: "/poll" }), {
            status: 202,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
    });

    return createOpenRouterVideo({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "google/veo-3.1",
      prompt: "A paper boat crosses a stream",
      duration: 8,
      resolution: "1080p",
      aspectRatio: "16:9",
      size: "1280x720",
      generateAudio: true,
      seed: 7,
      frameImages: [
        {
          type: "image_url",
          image_url: { url: "https://example.com/start.png" },
          frame_type: "first_frame",
        },
      ],
      inputReferences: [
        { type: "image_url", image_url: { url: "https://example.com/reference.png" } },
        { type: "audio_url", audio_url: { url: "https://example.com/reference.wav" } },
        { type: "video_url", video_url: { url: "https://example.com/reference.mp4" } },
      ],
      provider: { options: { "google-vertex": { parameters: { enhancePrompt: true } } } },
      callbackUrl: "https://example.com/openrouter-callback",
    }).pipe(
      Effect.map((job) => {
        expect(requestBody).toMatchObject({
          model: "google/veo-3.1",
          prompt: "A paper boat crosses a stream",
          duration: 8,
          resolution: "1080p",
          aspect_ratio: "16:9",
          size: "1280x720",
          generate_audio: true,
          seed: 7,
          frame_images: [{ frame_type: "first_frame" }],
          input_references: [{ type: "image_url" }, { type: "audio_url" }, { type: "video_url" }],
          provider: { options: { "google-vertex": { parameters: { enhancePrompt: true } } } },
          callback_url: "https://example.com/openrouter-callback",
        });
        expect(job.status).toBe("pending");
      }),
    );
  });

  it.effect("accepts local images as base64 data URLs for video references", () => {
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify({ id: "job-local", status: "pending" }), {
            status: 202,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );

    return createOpenRouterVideo({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "google/veo-3.1",
      prompt: "Animate this image gently",
      frameImages: [
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,AQID" },
          frame_type: "first_frame",
        },
      ],
      inputReferences: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,BAUG" } }],
    }).pipe(Effect.map((job) => expect(job.id).toBe("job-local")));
  });

  it.effect("polls a job and downloads its completed content", () => {
    const requestedUrls: Array<string> = [];
    const client = HttpClient.make((request) => {
      requestedUrls.push(request.url);
      if (request.url.endsWith("/content?index=0")) {
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(new Uint8Array([0, 1, 2]), {
              status: 200,
              headers: { "content-type": "video/mp4" },
            }),
          ),
        );
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({ id: "job-1", status: "completed", usage: { seconds: 8 } }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        ),
      );
    });

    return Effect.gen(function* () {
      const job = yield* fetchOpenRouterVideoJob({
        httpClient: client,
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "test-key",
        jobId: "job-1",
      });
      const download = yield* downloadOpenRouterVideo({
        httpClient: client,
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "test-key",
        jobId: job.id,
      });
      expect(job.status).toBe("completed");
      expect(download.mediaType).toBe("video/mp4");
      expect(Array.from(download.bytes)).toEqual([0, 1, 2]);
      expect(requestedUrls).toEqual([
        "https://openrouter.ai/api/v1/videos/job-1",
        "https://openrouter.ai/api/v1/videos/job-1/content?index=0",
      ]);
    });
  });

  it.effect(
    "downloads each completed video output through the authenticated content endpoint",
    () => {
      const requestedUrls: Array<string> = [];
      const client = HttpClient.make((request) => {
        requestedUrls.push(request.url);
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(new Uint8Array([1, 2, 3]), {
              status: 200,
              headers: { "content-type": "video/webm" },
            }),
          ),
        );
      });

      return Effect.gen(function* () {
        const first = yield* downloadOpenRouterVideo({
          httpClient: client,
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "test-key",
          jobId: "job-2",
          index: 0,
        });
        const second = yield* downloadOpenRouterVideo({
          httpClient: client,
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "test-key",
          jobId: "job-2",
          index: 1,
        });
        expect(first.mediaType).toBe("video/webm");
        expect(second.mediaType).toBe("video/webm");
        expect(requestedUrls).toEqual([
          "https://openrouter.ai/api/v1/videos/job-2/content?index=0",
          "https://openrouter.ai/api/v1/videos/job-2/content?index=1",
        ]);
      });
    },
  );
});

describe("streamOpenRouterCompletion", () => {
  it.effect("includes the upstream error detail for rejected requests", () => {
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({ error: { message: "This model does not accept images." } }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          ),
        ),
      ),
    );

    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        streamOpenRouterCompletion({
          httpClient: client,
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "test-key",
          model: "openai/test",
          messages: [{ role: "user", content: "hello" }],
        }),
      );
      expect(error.message).toContain("This model does not accept images.");
    });
  });

  it.effect("preserves multimodal user content in the OpenRouter request", () => {
    let requestBody: Record<string, unknown> | undefined;
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body)
        requestBody = JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>;
      return Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response(responseBody, { status: 200 })),
      );
    });

    return streamOpenRouterCompletion({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "openai/test",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image." },
            { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
          ],
        },
      ],
    }).pipe(
      Effect.flatMap((stream) => Stream.runDrain(stream)),
      Effect.map(() => {
        expect(requestBody?.messages).toEqual([
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image." },
              { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
            ],
          },
        ]);
      }),
    );
  });

  it.effect("parses SSE chunks incrementally across transport boundaries", () => {
    const encoder = new TextEncoder();
    const bodyChunks = [
      'data: {"model":"openai/test","choices":[{"delta":{"content":"Hel"}}]}\r\n',
      '\r\ndata: {"choices":[{"delta":{"content":"lo "}}]}\n\ndata: {"choices":[{"delta":{"content":"world"}}],"usage":{"total_tokens":3}}\n',
      "data: [DONE]\n\n",
    ].map((chunk) => encoder.encode(chunk));
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of bodyChunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(responseBody, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        ),
      ),
    );

    return streamOpenRouterCompletion({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "openai/test",
      messages: [{ role: "user", content: "hello" }],
    }).pipe(
      Effect.flatMap((stream) => Stream.runCollect(stream)),
      Effect.map((chunks) => Array.from(chunks)),
      Effect.map((chunks) => {
        expect(chunks).toEqual([
          { delta: "Hel", done: false, model: "openai/test" },
          { delta: "lo ", done: false },
          { delta: "world", done: false, usage: { total_tokens: 3 } },
          { delta: "", done: true },
        ]);
      }),
    );
  });

  it.effect("enables OpenRouter web search and preserves citation annotations", () => {
    const encoder = new TextEncoder();
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Current answer","annotations":[{"type":"url_citation","url":"https://example.com"}]}}],"usage":{"server_tool_use":{"web_search_requests":2}}}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    let requestBody: unknown;
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body) requestBody = JSON.parse(new TextDecoder().decode(body.body)) as unknown;
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(responseBody, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        ),
      );
    });

    return streamOpenRouterCompletion({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "openai/test",
      messages: [{ role: "user", content: "What is current?" }],
    }).pipe(
      Effect.flatMap((stream) => Stream.runCollect(stream)),
      Effect.map((chunks) => {
        expect(requestBody).toMatchObject({
          tools: [{ type: "openrouter:web_search" }, { type: "openrouter:web_fetch" }],
          max_tool_calls: 5,
        });
        expect(Array.from(chunks)[0]?.annotations).toEqual([
          { type: "url_citation", url: "https://example.com" },
        ]);
        expect(Array.from(chunks)[0]?.usage).toEqual({
          server_tool_use: { web_search_requests: 2 },
        });
      }),
    );
  });

  it.effect("parses streamed function tool calls and advertises workspace tools", () => {
    const encoder = new TextEncoder();
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"src/"}}]}}]}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"main.ts\\"}"}}]}}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    let requestBody: unknown;
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body) requestBody = JSON.parse(new TextDecoder().decode(body.body)) as unknown;
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(responseBody, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        ),
      );
    });

    return streamOpenRouterCompletion({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "openai/test",
      messages: [{ role: "user", content: "Read the file." }],
      tools: [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read a file.",
            parameters: { type: "object" },
          },
        },
      ],
      modelCapabilities: { supportedParameters: ["tools", "tool_choice"] },
    }).pipe(
      Effect.flatMap((stream) => Stream.runCollect(stream)),
      Effect.map((chunks) => {
        expect(requestBody).toMatchObject({
          tool_choice: "auto",
          provider: { require_parameters: true },
          tools: [
            { type: "openrouter:web_search" },
            { type: "openrouter:web_fetch" },
            { type: "function", function: { name: "read_file" } },
          ],
        });
        expect(requestBody).not.toHaveProperty("parallel_tool_calls");
        expect(requestBody).toHaveProperty("max_tool_calls", 5);
        expect(Array.from(chunks).flatMap((chunk) => chunk.toolCallDeltas ?? [])).toEqual([
          { index: 0, id: "call-1", name: "read_file", argumentsDelta: '{"path":"src/' },
          { index: 0, argumentsDelta: 'main.ts"}' },
        ]);
      }),
    );
  });

  it.effect("omits local tools and tool choice for models without tool metadata", () => {
    let requestBody: Record<string, unknown> | undefined;
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const client = HttpClient.make((request) => {
      const body = request.body as { readonly body?: Uint8Array };
      if (body.body)
        requestBody = JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>;
      return Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response(responseBody, { status: 200 })),
      );
    });
    return streamOpenRouterCompletion({
      httpClient: client,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "openai/test",
      messages: [{ role: "user", content: "hello" }],
      modelCapabilities: { supportedParameters: ["max_tokens"] },
      tools: [
        { type: "function", function: { name: "read_file", description: "read", parameters: {} } },
      ],
    }).pipe(
      Effect.flatMap((stream) => Stream.runDrain(stream)),
      Effect.map(() => {
        expect(requestBody?.tool_choice).toBeUndefined();
        expect(requestBody?.provider).toBeUndefined();
        expect(requestBody?.tools).toEqual([
          { type: "openrouter:web_search" },
          { type: "openrouter:web_fetch" },
        ]);
      }),
    );
  });
});
