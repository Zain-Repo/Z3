import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentHttpApi,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import {
  annotateEnvironmentRequest,
  failEnvironmentAuthInvalid,
  failEnvironmentInternal,
  failEnvironmentInvalidRequest,
  failEnvironmentScopeRequired,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { ImageGenerationService as ImageGenerationServiceTag } from "./ImageGenerationService.ts";
import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";

const IMAGE_ASSET_ROUTE_PREFIX = "/api/images/assets";

function decodeAssetId(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export const imageGenerationHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "imageGeneration",
  Effect.fnUntraced(function* (handlers) {
    const service = yield* ImageGenerationServiceTag;
    return handlers
      .handle(
        "models",
        Effect.fn("environment.images.models")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* service
            .listModels()
            .pipe(
              Effect.catchTag("ImageGenerationServiceError", () =>
                failEnvironmentInternal("internal_error"),
              ),
            );
        }),
      )
      .handle(
        "modelEndpoints",
        Effect.fn("environment.images.modelEndpoints")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* service
            .listModelEndpoints(`${args.params.author}/${args.params.slug}`)
            .pipe(
              Effect.catchTag("ImageGenerationServiceError", () =>
                failEnvironmentInternal("internal_error"),
              ),
            );
        }),
      )
      .handle(
        "generations",
        Effect.fn("environment.images.generations")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* service
            .listGenerations()
            .pipe(
              Effect.catchTag("ImageGenerationServiceError", () =>
                failEnvironmentInternal("internal_error"),
              ),
            );
        }),
      )
      .handle(
        "generate",
        Effect.fn("environment.images.generate")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          return yield* service
            .generate(args.payload)
            .pipe(
              Effect.catchTag("ImageGenerationServiceError", () =>
                failEnvironmentInvalidRequest("invalid_command"),
              ),
            );
        }),
      )
      .handle(
        "assetContent",
        Effect.fn("environment.images.assetContent")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          const asset = yield* service
            .readAsset(args.params.id)
            .pipe(
              Effect.catchTag("ImageGenerationServiceError", () =>
                failEnvironmentInternal("internal_error"),
              ),
            );
          if (!asset) return yield* failEnvironmentInternal("internal_error");
          return {
            mediaType: asset.media_type,
            data: Buffer.from(asset.bytes).toString("base64"),
          };
        }),
      )
      .handle(
        "deleteGeneration",
        Effect.fn("environment.images.deleteGeneration")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          const deleted = yield* service
            .deleteGeneration(args.params.id)
            .pipe(
              Effect.catchTag("ImageGenerationServiceError", () =>
                failEnvironmentInternal("internal_error"),
              ),
            );
          return { deleted };
        }),
      );
  }),
);

export const imageAssetRouteLayer = HttpRouter.add(
  "GET",
  `${IMAGE_ASSET_ROUTE_PREFIX}/*`,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const session = yield* serverAuth.authenticateHttpRequest(request).pipe(
      Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
        failEnvironmentAuthInvalid(EnvironmentAuth.serverAuthCredentialReason(error)),
      ),
      Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, () =>
        failEnvironmentInternal("internal_error"),
      ),
    );
    if (!session.scopes.includes(AuthOrchestrationReadScope)) {
      return yield* failEnvironmentScopeRequired(AuthOrchestrationReadScope);
    }
    const service = yield* ImageGenerationServiceTag;
    const suffix = request.originalUrl.split("?")[0]?.slice(`${IMAGE_ASSET_ROUTE_PREFIX}/`.length);
    if (!suffix || suffix.includes("/") || suffix.includes("%2f") || suffix.includes("%2F")) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }
    const id = decodeAssetId(suffix);
    if (!id) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }
    const asset = yield* service
      .readAsset(id)
      .pipe(Effect.catchTag("ImageGenerationServiceError", () => Effect.succeed(null)));
    if (!asset) return HttpServerResponse.text("Not Found", { status: 404 });
    return HttpServerResponse.uint8Array(asset.bytes, {
      status: 200,
      contentType: asset.media_type,
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }),
);
