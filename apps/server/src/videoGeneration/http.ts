import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentHttpApi,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import {
  annotateEnvironmentRequest,
  failEnvironmentAuthInvalid,
  failEnvironmentInternal,
  failEnvironmentInvalidRequest,
  failEnvironmentScopeRequired,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { VideoGenerationService as VideoGenerationServiceTag } from "./VideoGenerationService.ts";

const VIDEO_ASSET_ROUTE_PREFIX = "/api/videos/assets";

function decodeAssetId(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export const videoGenerationHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "videoGeneration",
  Effect.fnUntraced(function* (handlers) {
    const service = yield* VideoGenerationServiceTag;
    return handlers
      .handle(
        "models",
        Effect.fn("environment.videos.models")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* service.listModels().pipe(
            Effect.map((models) => ({ models })),
            Effect.catchTag("VideoGenerationServiceError", () =>
              failEnvironmentInternal("internal_error"),
            ),
          );
        }),
      )
      .handle(
        "generations",
        Effect.fn("environment.videos.generations")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* service
            .listGenerations()
            .pipe(
              Effect.catchTag("VideoGenerationServiceError", () =>
                failEnvironmentInternal("internal_error"),
              ),
            );
        }),
      )
      .handle(
        "generate",
        Effect.fn("environment.videos.generate")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          return yield* service
            .generate(args.payload)
            .pipe(
              Effect.catchTag("VideoGenerationServiceError", () =>
                failEnvironmentInvalidRequest("invalid_command"),
              ),
            );
        }),
      )
      .handle(
        "deleteGeneration",
        Effect.fn("environment.videos.deleteGeneration")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          const deleted = yield* service
            .deleteGeneration(args.params.id)
            .pipe(
              Effect.catchTag("VideoGenerationServiceError", () =>
                failEnvironmentInternal("internal_error"),
              ),
            );
          return { deleted };
        }),
      );
  }),
);

export const videoAssetRouteLayer = HttpRouter.add(
  "GET",
  `${VIDEO_ASSET_ROUTE_PREFIX}/*`,
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
    const service = yield* VideoGenerationServiceTag;
    const suffix = request.originalUrl.split("?")[0]?.slice(`${VIDEO_ASSET_ROUTE_PREFIX}/`.length);
    if (!suffix || suffix.includes("/") || suffix.includes("%2f") || suffix.includes("%2F")) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }
    const id = decodeAssetId(suffix);
    if (!id) return HttpServerResponse.text("Not Found", { status: 404 });
    const asset = yield* service
      .readAsset(id)
      .pipe(Effect.catchTag("VideoGenerationServiceError", () => Effect.succeed(null)));
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
