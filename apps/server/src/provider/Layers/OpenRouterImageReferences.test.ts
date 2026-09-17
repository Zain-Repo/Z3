import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import catalog from "./OpenRouterImageReferences.fixture.json" with { type: "json" };
import {
  generateOpenRouterImage,
  resolveOpenRouterImageCapabilities,
  sanitizeOpenRouterImageInput,
  type OpenRouterImageModelEndpoint,
} from "./OpenRouterApi.ts";
import { resolveImageModelRouting } from "./OpenRouterImageRouting.ts";

// Public Image Models API and per-model endpoints snapshot, 2026-09-17.
// Keep this offline: tests must not spend credits or depend on catalog availability.
describe("OpenRouter catalog reference images", () => {
  for (const model of catalog) {
    it.effect(`preserves reference bytes for ${model.id}`, () =>
      Effect.gen(function* () {
        let sent: unknown;
        const httpClient = HttpClient.make((request) => {
          if (request.body._tag === "Uint8Array") {
            sent = JSON.parse(new TextDecoder().decode(request.body.body));
          }
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(JSON.stringify({ data: [{ b64_json: "AQID" }] }), {
                headers: { "content-type": "application/json" },
              }),
            ),
          );
        });
        const endpoints: OpenRouterImageModelEndpoint[] = model.endpoints.map((endpoint) => ({
          providerSlug: endpoint.providerSlug,
          supportedParameters: endpoint.references
            ? { input_references: { ...endpoint.references, type: "range" } }
            : {},
          allowedPassthroughParameters: [],
          supportsStreaming: false,
          pricing: [],
        }));
        const provider = resolveImageModelRouting(model.id, undefined, endpoints);
        const inputReferences = Array.from({ length: model.references?.max ?? 1 }, (_, index) => ({
          type: "image_url" as const,
          image_url: {
            url: index % 2 === 0 ? "data:image/png;base64,AQID" : "https://example.com/ref.webp",
          },
        }));
        const input = {
          httpClient,
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "test-key",
          model: model.id,
          prompt: "Use the attached subject",
          inputReferences,
          ...(provider ? { provider } : {}),
        };
        // Empty endpoint metadata follows the service's pass-through behavior.
        const sanitized = endpoints.length
          ? sanitizeOpenRouterImageInput(
              input,
              resolveOpenRouterImageCapabilities({ id: model.id, endpoints }, provider),
            )
          : input;
        yield* generateOpenRouterImage(sanitized);
        expect(sent).toMatchObject({ model: model.id, input_references: inputReferences });
        if (model.references) {
          expect(() =>
            sanitizeOpenRouterImageInput(
              { ...input, inputReferences: [...inputReferences, inputReferences[0]!] },
              resolveOpenRouterImageCapabilities({ id: model.id, endpoints }, provider),
            ),
          ).toThrow("accepts at most");
        }
      }),
    );
  }
});
