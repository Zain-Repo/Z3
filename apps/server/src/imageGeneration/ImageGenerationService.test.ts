import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ProviderInstanceRegistry } from "../provider/Services/ProviderInstanceRegistry.ts";
import {
  DEFAULT_IMAGE_DIRECTION,
  prepareImagePrompt,
  ZIMAGE_REALISM_RULES,
} from "@t3tools/shared/imageCreativeDirection";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { FAL_IMAGE_MODELS } from "../mediaGeneration/FalModels.ts";
import { runMigrations } from "../persistence/Migrations.ts";
import * as NodeSqliteClient from "../persistence/NodeSqliteClient.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import * as ImageGenerationService from "./ImageGenerationService.ts";

const decodeOpenRouterRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ prompt: Schema.String })),
);
const decodeCivitaiRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      steps: Schema.Array(Schema.Struct({ input: Schema.Struct({ prompt: Schema.String }) })),
    }),
  ),
);

const instanceId = ProviderInstanceId.make("civitai");
const layer = it.layer(
  Layer.mergeAll(
    NodeSqliteClient.layerMemory(),
    NodeServices.layer,
    Layer.succeed(ProviderInstanceRegistry, {
      listInstances: Effect.succeed([]),
      listUnavailable: Effect.succeed([]),
      getInstance: () => Effect.succeed(undefined),
      streamChanges: Stream.empty,
      subscribeChanges: Effect.die("Not used by image generation tests"),
    }),
    ServerSettingsService.layerTest({
      providerInstances: {
        [ProviderInstanceId.make("fal")]: {
          driver: ProviderDriverKind.make("fal"),
          enabled: true,
          environment: [{ name: "FAL_KEY", value: "fal-test-key", sensitive: true }],
        },
        [ProviderInstanceId.make("openrouter")]: {
          driver: ProviderDriverKind.make("openrouter"),
          enabled: true,
          environment: [{ name: "OPENROUTER_API_KEY", value: "test-key", sensitive: true }],
        },
        [instanceId]: {
          driver: ProviderDriverKind.make("civitai"),
          enabled: true,
          environment: [{ name: "CIVITAI_API_KEY", value: "test-key", sensitive: true }],
        },
      },
    }),
  ),
);

layer("ImageGenerationService image routing", (it) => {
  it.effect("lists fal models and saves referenced edits without using OpenRouter", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 42 });
      const urls: string[] = [];
      const queue = "https://queue.fal.run/fal-ai/flux-2/requests/fal-image";
      const client = HttpClient.make((request) => {
        urls.push(request.url);
        const response =
          request.method === "POST"
            ? Response.json({
                request_id: "fal-image",
                status_url: `${queue}/status`,
                response_url: queue,
                cancel_url: `${queue}/cancel`,
              })
            : request.url.endsWith("/status")
              ? Response.json({ status: "COMPLETED", response_url: queue })
              : request.url === queue
                ? Response.json({ images: [{ url: "https://v3.fal.media/image.png" }] })
                : new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
        return Effect.succeed(HttpClientResponse.fromWeb(request, response));
      });
      yield* Effect.gen(function* () {
        const service = yield* ImageGenerationService.ImageGenerationService;
        const models = yield* service.listModels(ProviderInstanceId.make("fal"));
        assert.equal(models.models.length, FAL_IMAGE_MODELS.length);
        assert.equal(urls.length, 0);
        const input = {
          model: "fal/flux-2",
          providerInstanceId: ProviderInstanceId.make("fal"),
          prompt: "A blue cup",
          inputReferences: [{ url: "data:image/png;base64,iVBORw0KGgo=" }],
        };
        const record = yield* service.generate(input);
        assert.equal(record.assets.length, 1);
        assert.deepEqual(record.input, input);
        assert.equal(urls[0], "https://queue.fal.run/fal-ai/flux-2/edit");
        assert.ok(urls.every((url) => !url.includes("openrouter")));
      }).pipe(
        Effect.provide(
          ImageGenerationService.layer.pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
        ),
      );
    }),
  );
  it.effect("applies direction to OpenRouter and retains reusable direction in history", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 42 });
      let providerPrompt = "";

      const client = HttpClient.make((request) => {
        if (request.method === "POST" && request.body._tag === "Uint8Array") {
          providerPrompt = decodeOpenRouterRequest(
            new TextDecoder().decode(request.body.body),
          ).prompt;
        }
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(
              request.method === "POST"
                ? { data: [{ b64_json: "iVBORw0KGgo=", media_type: "image/png" }] }
                : { data: { id: "google/image", endpoints: [] } },
            ),
          ),
        );
      });
      yield* Effect.gen(function* () {
        const service = yield* ImageGenerationService.ImageGenerationService;
        const input = {
          model: "google/image",
          prompt: "A blue cup",
          creativeDirection: { ...DEFAULT_IMAGE_DIRECTION, realism: "natural" as const },
        };
        const record = yield* service.generate(input);
        assert.equal(providerPrompt, prepareImagePrompt(input));
        assert.equal(providerPrompt.split(ZIMAGE_REALISM_RULES).length, 2);
        assert.ok(providerPrompt.includes("plausible lens perspective"));
        assert.equal(record.prompt, input.prompt);
        assert.deepEqual(record.input, input);
        const history = yield* service.listGenerations();
        assert.deepEqual(history.generations.find((entry) => entry.id === record.id)?.input, input);
        const plainInput = { model: input.model, prompt: "A flat ink illustration of a cup" };
        const plainRecord = yield* service.generate(plainInput);
        assert.equal(providerPrompt, prepareImagePrompt(plainInput));
        assert.equal(providerPrompt.split(ZIMAGE_REALISM_RULES).length, 2);
        assert.equal(plainRecord.prompt, plainInput.prompt);
        assert.deepEqual(plainRecord.input, plainInput);
      }).pipe(
        Effect.provide(
          ImageGenerationService.layer.pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
        ),
      );
    }),
  );
  it.effect("saves Civitai images and reusable settings without calling OpenRouter", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 42 });
      const requestedUrls: string[] = [];
      let providerPrompt = "";
      const client = HttpClient.make((request) => {
        requestedUrls.push(request.url);
        if (request.method === "POST" && request.body._tag === "Uint8Array") {
          providerPrompt =
            decodeCivitaiRequest(new TextDecoder().decode(request.body.body)).steps[0]?.input
              .prompt ?? "";
        }
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            request.method === "POST"
              ? Response.json({
                  id: "workflow-1",
                  status: "succeeded",
                  steps: [
                    {
                      output: {
                        images: [{ available: true, url: "https://image.civitai.com/test.png" }],
                      },
                    },
                  ],
                })
              : new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
                  headers: { "content-type": "image/png" },
                }),
          ),
        );
      });
      yield* Effect.gen(function* () {
        const service = yield* ImageGenerationService.ImageGenerationService;
        const input = {
          providerInstanceId: instanceId,
          model: "civitai/z-image-turbo",
          prompt: "A tree",
        };
        const record = yield* service.generate(input);
        assert.equal(providerPrompt, prepareImagePrompt(input));
        assert.equal(providerPrompt.split(ZIMAGE_REALISM_RULES).length, 2);
        assert.deepEqual(record.input, input);
        assert.lengthOf(record.assets, 1);
        assert.equal(record.assets[0]?.mediaType, "image/png");
        const history = yield* service.listGenerations();
        assert.deepEqual(history.generations.find((entry) => entry.id === record.id)?.input, input);
        assert.isTrue(requestedUrls.every((url) => !url.includes("openrouter")));
        assert.lengthOf(requestedUrls, 2);
      }).pipe(
        Effect.provide(
          ImageGenerationService.layer.pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
        ),
      );
    }),
  );

  it.effect(
    "applies creative direction at the provider boundary and preserves the original brief on readback",
    () =>
      Effect.gen(function* () {
        yield* runMigrations({ toMigrationInclusive: 42 });
        const requestedUrls: string[] = [];
        let providerPrompt = "";

        const client = HttpClient.make((request) => {
          requestedUrls.push(request.url);
          if (request.method === "POST" && request.body._tag === "Uint8Array") {
            providerPrompt =
              decodeCivitaiRequest(new TextDecoder().decode(request.body.body)).steps[0]?.input
                .prompt ?? "";
          }
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              request.method === "POST"
                ? Response.json({
                    id: "workflow-1",
                    status: "succeeded",
                    steps: [
                      {
                        output: {
                          images: [{ available: true, url: "https://image.civitai.com/test.png" }],
                        },
                      },
                    ],
                  })
                : new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
                    headers: { "content-type": "image/png" },
                  }),
            ),
          );
        });
        yield* Effect.gen(function* () {
          const service = yield* ImageGenerationService.ImageGenerationService;
          const input = {
            providerInstanceId: instanceId,
            model: "civitai/z-image-turbo",
            prompt: "A tree",
            creativeDirection: {
              ...DEFAULT_IMAGE_DIRECTION,
              style: "photographic" as const,
              lighting: "daylight" as const,
            },
          };
          const record = yield* service.generate(input);
          assert.equal(providerPrompt, prepareImagePrompt(input));
          assert.equal(providerPrompt.split(ZIMAGE_REALISM_RULES).length, 2);
          assert.include(providerPrompt, "lifelike surface texture");
          assert.equal(record.prompt, "A tree");
          assert.deepEqual(record.input, input);
          assert.lengthOf(record.assets, 1);
          assert.equal(record.assets[0]?.mediaType, "image/png");
          const history = yield* service.listGenerations();
          assert.deepEqual(
            history.generations.find((entry) => entry.id === record.id)?.input,
            input,
          );
          assert.isTrue(requestedUrls.every((url) => !url.includes("openrouter")));
          assert.lengthOf(requestedUrls, 2);
        }).pipe(
          Effect.provide(
            ImageGenerationService.layer.pipe(
              Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
            ),
          ),
        );
      }),
  );

  it.effect("rejects a disabled Civitai key before making any provider request", () =>
    Effect.gen(function* () {
      const settings = yield* ServerSettingsService;
      yield* settings.updateSettings({
        providerInstances: {
          [instanceId]: {
            driver: ProviderDriverKind.make("civitai"),
            enabled: false,
          },
        },
      });
      let requests = 0;
      const client = HttpClient.make((request) => {
        requests++;
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({})));
      });
      yield* Effect.gen(function* () {
        const service = yield* ImageGenerationService.ImageGenerationService;
        const result = yield* service
          .generate({
            providerInstanceId: instanceId,
            model: "civitai/z-image-turbo",
            prompt: "A tree",
          })
          .pipe(Effect.flip);
        assert.include(result.message, "Configure and enable");
        assert.equal(requests, 0);
      }).pipe(
        Effect.provide(
          ImageGenerationService.layer.pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
        ),
      );
    }),
  );
});
