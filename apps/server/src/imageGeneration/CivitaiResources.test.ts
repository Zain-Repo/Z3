import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { resolveCivitaiOptions, searchCivitaiResources } from "./CivitaiResources.ts";
import { CIVITAI_MODELS } from "./CivitaiModels.ts";
import { generateCivitaiImage } from "./CivitaiApi.ts";

const checkpoint = "urn:air:sdxl:checkpoint:civitai:1@2";
const decodeJson = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);
const lora = "urn:air:sdxl:lora:civitai:3@4";
const recipe = CIVITAI_MODELS.find((model) => model.id === "civitai/comfy-sdxl-checkpoint")!;
const clientFor = (response: (url: string) => unknown) =>
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(response(request.url)))),
  );
const detail = (air: string, baseModel = "Pony") => ({
  id: air === checkpoint ? 2 : 4,
  name: "v1",
  air,
  baseModel,
  trainedWords: ["style"],
  model: { type: air === checkpoint ? "Checkpoint" : "LORA" },
});

describe("Civitai resources", () => {
  it.effect("omits catalog candidates when account availability rejects generation", () =>
    Effect.gen(function* () {
      const client = clientFor((url) =>
        url.includes("models?")
          ? {
              items: [
                {
                  name: "Unavailable",
                  type: "Checkpoint",
                  modelVersions: [
                    { id: 2, name: "v1", baseModel: "Pony", supportsGeneration: true },
                  ],
                },
              ],
            }
          : { ...detail(checkpoint), canGenerate: false },
      );
      const result = yield* searchCivitaiResources(client, "fake", {
        model: recipe.id,
        type: "Checkpoint",
        query: "Unavailable",
      });
      expect(result.resources).toEqual([]);
    }),
  );
  for (const [id, family, expected] of [
    ["flux2-dev", "Flux.2 D", { numInferenceSteps: 20, guidanceScale: 3 }],
    ["wan-v2.2", "Wan Video 2.2 T2V-A14B", { steps: 20, guidanceScale: 3 }],
  ] as const) {
    it.effect(`maps ${id} LoRAs and advanced parameters to its array schema`, () =>
      Effect.gen(function* () {
        const entry = CIVITAI_MODELS.find((model) => model.id === `civitai/${id}`)!;
        const client = clientFor(() => ({ ...detail(lora, family), canGenerate: true }));
        expect(
          yield* resolveCivitaiOptions(client, "fake", entry, {
            loras: [{ air: lora, strength: 4 }],
            steps: 20,
            cfgScale: 3,
          }),
        ).toEqual({ ...expected, loras: [{ air: lora, strength: 4 }] });
        const invalid = yield* resolveCivitaiOptions(client, "fake", entry, {
          loras: [{ air: lora, strength: -1 }],
        }).pipe(Effect.flip);
        expect(invalid.message).toContain("between 0 and 4");
      }),
    );
  }

  it.effect("rejects cross-architecture Klein LoRAs and accepts the matching dictionary", () =>
    Effect.gen(function* () {
      const entry = CIVITAI_MODELS.find((model) => model.id === "civitai/flux2-klein-4b")!;
      const wrong = clientFor(() => ({ ...detail(lora, "Flux.2 Klein 9B"), canGenerate: true }));
      yield* resolveCivitaiOptions(wrong, "fake", entry, {
        loras: [{ air: lora, strength: 1 }],
      }).pipe(Effect.flip);
      const right = clientFor(() => ({ ...detail(lora, "Flux.2 Klein 4B"), canGenerate: true }));
      expect(
        yield* resolveCivitaiOptions(right, "fake", entry, {
          loras: [{ air: lora, strength: -1 }],
        }),
      ).toEqual({ loras: { [lora]: -1 } });
    }),
  );
  it.effect("submits validated resources in the paid workflow and downloads the result", () =>
    Effect.gen(function* () {
      let posts = 0;
      const client = HttpClient.make((request) => {
        if (request.method === "POST") {
          posts++;
          expect(request.body._tag).toBe("Uint8Array");
          if (request.body._tag === "Uint8Array")
            expect(decodeJson(new TextDecoder().decode(request.body.body))).toMatchObject({
              steps: [
                {
                  $type: "imageGen",
                  input: {
                    engine: "comfy",
                    ecosystem: "sdxl",
                    operation: "createImage",
                    model: checkpoint,
                    loras: { [lora]: 0.75 },
                    cfgScale: 6.5,
                    steps: 25,
                    negativePrompt: "blur",
                  },
                },
              ],
            });
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({
                id: "workflow",
                status: "succeeded",
                steps: [
                  {
                    output: {
                      images: [
                        { id: "image", available: true, url: "https://image.civitai.com/test.png" },
                      ],
                    },
                  },
                ],
              }),
            ),
          );
        }
        if (request.url.startsWith("https://image.civitai.com/"))
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])),
            ),
          );
        const resource = detail(request.url.endsWith("/2") ? checkpoint : lora);
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, Response.json({ ...resource, canGenerate: true })),
        );
      });
      const result = yield* generateCivitaiImage(client, "fake-key", {
        model: recipe.id,
        prompt: "A landscape",
        civitai: {
          checkpoint,
          loras: [{ air: lora, strength: 0.75 }],
          cfgScale: 6.5,
          steps: 25,
          negativePrompt: "blur",
        },
      });
      expect(result.data).toHaveLength(1);
      expect(posts).toBe(1);
    }),
  );
  it.effect("maps canonical checkpoints and weighted LoRAs to worker fields", () =>
    Effect.gen(function* () {
      const client = clientFor((url) =>
        url.includes("/mini/")
          ? { ...detail(url.endsWith("/2") ? checkpoint : lora), canGenerate: true }
          : detail(url.endsWith("/2") ? checkpoint : lora),
      );
      expect(
        yield* resolveCivitaiOptions(client, "fake-key", recipe, {
          checkpoint,
          loras: [{ air: lora, strength: 0.75 }],
          steps: 25,
          cfgScale: 6.5,
          negativePrompt: "blur",
        }),
      ).toEqual({
        model: checkpoint,
        loras: { [lora]: 0.75 },
        steps: 25,
        cfgScale: 6.5,
        negativePrompt: "blur",
      });
    }),
  );
  for (const scenario of ["mismatch", "unavailable", "missing", "duplicate", "strength"] as const) {
    it.effect(`rejects ${scenario} before a paid submission`, () =>
      Effect.gen(function* () {
        let posts = 0;
        const client = HttpClient.make((request) => {
          if (request.method === "POST") posts++;
          const air = request.url.endsWith("/2") ? checkpoint : lora;
          const resource = detail(
            air,
            scenario === "mismatch" && air === lora ? "Illustrious" : "Pony",
          );
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ ...resource, canGenerate: scenario !== "unavailable" }),
            ),
          );
        });
        const result = yield* generateCivitaiImage(client, "fake-key", {
          model: recipe.id,
          prompt: "A landscape",
          civitai: {
            ...(scenario !== "missing" ? { checkpoint } : {}),
            loras:
              scenario === "duplicate"
                ? [
                    { air: lora, strength: 1 },
                    { air: lora, strength: 1 },
                  ]
                : [{ air: lora, strength: scenario === "strength" ? 3 : 1 }],
          },
        }).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        expect(posts).toBe(0);
      }),
    );
  }
  it.effect("maps an optional ZImage checkpoint to diffuserModel", () =>
    Effect.gen(function* () {
      const air = "urn:air:zimage:diffusionmodel:civitai:1@2+9.safetensors";
      const client = clientFor(() => ({
        id: 2,
        name: "v1",
        air,
        baseModel: "ZImageBase",
        model: { type: "Checkpoint" },
        canGenerate: true,
      }));
      expect(
        yield* resolveCivitaiOptions(
          client,
          "fake-key",
          CIVITAI_MODELS.find((model) => model.id === "civitai/z-image-base")!,
          { checkpoint: air },
        ),
      ).toEqual({ diffuserModel: air });
    }),
  );
  it.effect("pages versions without losing the remainder of an upstream page", () =>
    Effect.gen(function* () {
      const urls: string[] = [];
      const client = clientFor((url) => {
        urls.push(url);
        if (url.includes("models?"))
          return {
            items: [
              {
                name: "Style",
                type: "LORA",
                modelVersions: Array.from({ length: 22 }, (_, i) => ({
                  id: i + 1,
                  name: "v1",
                  baseModel: "Pony",
                  supportsGeneration: true,
                })),
              },
            ],
            metadata: { nextCursor: "upstream" },
          };
        const id = Number(url.split("/").at(-1));
        return {
          id,
          name: "v1",
          air: `urn:air:sdxl:lora:civitai:3@${id}`,
          baseModel: "Pony",
          model: { type: "LORA" },
          canGenerate: true,
        };
      });
      const first = yield* searchCivitaiResources(client, "fake-key", {
        model: recipe.id,
        type: "LORA",
        query: "style",
      });
      const second = yield* searchCivitaiResources(client, "fake-key", {
        model: recipe.id,
        type: "LORA",
        query: "style",
        cursor: first.nextCursor!,
      });
      expect(first.resources).toHaveLength(20);
      expect(second.resources).toHaveLength(2);
      expect(
        urls
          .filter((url) => url.includes("models?"))
          .every((url) => !url.includes("supportsGeneration=") && !url.includes("cursor=")),
      ).toBe(true);
      expect(first.resources[0]?.trainedWords).toEqual([]);
    }),
  );
  for (const query of [
    "IntoRealism",
    "https://civitai.com/models/1609320/intorealism?modelVersionId=3258780",
    "https://civitai.com/api/v1/model-versions/3258780",
    "https://civitai.com/models/1609320/intorealism",
    "urn:air:zimageturbo:checkpoint:civitai:1609320@3258780",
  ]) {
    it.effect(`finds generation-enabled ZImage checkpoints by ${query}`, () =>
      Effect.gen(function* () {
        const air = "urn:air:zimageturbo:checkpoint:civitai:1609320@3258780";
        const version = {
          id: 3258780,
          name: "ZIT V9.0",
          baseModel: "ZImageTurbo",
          supportsGeneration: false,
          air,
        };
        const model = { name: "IntoRealism", type: "Checkpoint", modelVersions: [version] };
        const client = clientFor((url) => {
          expect(url.startsWith("https://civitai.com/api/v1/")).toBe(true);
          expect(url).not.toContain("supportsGeneration=");
          if (url.includes("models?")) return { items: [model] };
          if (url.endsWith("models/1609320")) return model;
          return { ...version, model, canGenerate: true };
        });
        const result = yield* searchCivitaiResources(client, "fake", {
          model: "civitai/z-image-turbo",
          type: "Checkpoint",
          query,
        });
        expect(result.resources).toEqual([
          {
            air,
            name: "IntoRealism",
            versionName: "ZIT V9.0",
            baseModel: "ZImageTurbo",
            trainedWords: [],
          },
        ]);
      }),
    );
  }
  for (const scenario of [
    "unavailable",
    "incompatible",
    "model-mismatch",
    "external-url",
  ] as const) {
    it.effect(`rejects exact checkpoint lookup ${scenario}`, () =>
      Effect.gen(function* () {
        let requests = 0;
        const client = clientFor(() => {
          requests++;
          return {
            id: 3258780,
            name: "ZIT V9.0",
            air: `urn:air:zimageturbo:checkpoint:civitai:${scenario === "model-mismatch" ? 99 : 1609320}@3258780`,
            baseModel: scenario === "incompatible" ? "SD 1.5" : "ZImageTurbo",
            model: { type: "Checkpoint", name: "IntoRealism" },
            canGenerate: scenario !== "unavailable",
          };
        });
        const error = yield* searchCivitaiResources(client, "fake", {
          model: "civitai/z-image-turbo",
          type: "Checkpoint",
          query:
            scenario === "external-url"
              ? "https://evil.example/models/1609320?modelVersionId=3258780"
              : "https://civitai.com/models/1609320/intorealism?modelVersionId=3258780",
        }).pipe(Effect.flip);
        expect(error.message).toContain(
          scenario === "unavailable"
            ? "unavailable"
            : scenario === "incompatible"
              ? "not compatible"
              : scenario === "model-mismatch"
                ? "does not match"
                : "valid Civitai",
        );
        if (scenario === "external-url") expect(requests).toBe(0);
      }),
    );
  }
  it.effect("rejects invalid AIRs without making external requests", () =>
    Effect.gen(function* () {
      let requests = 0;
      const client = clientFor(() => {
        requests++;
        return {};
      });
      const result = yield* resolveCivitaiOptions(client, "fake-key", recipe, {
        checkpoint: "https://evil.example/model",
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      expect(requests).toBe(0);
    }),
  );
});
