import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { deepSeekUsage, openRouterUsage } from "../providerUsage.ts";

/** Usage is optional metadata: its failure must not mark a working connection unhealthy. */
export const fetchProviderUsage = Effect.fn("fetchProviderUsage")(function* (
  client: HttpClient.HttpClient,
  baseUrl: string,
  apiKey: string,
  provider: "openrouter" | "deepseek",
) {
  return yield* Effect.gen(function* () {
    const response = yield* client.execute(
      HttpClientRequest.get(
        `${baseUrl.replace(/\/+$/, "")}/${provider === "openrouter" ? "key" : "user/balance"}`,
      ).pipe(HttpClientRequest.bearerToken(apiKey)),
    );
    if (response.status !== 200) return undefined;
    const body = yield* response.json;
    return provider === "openrouter" ? openRouterUsage(body) : deepSeekUsage(body);
  }).pipe(
    Effect.timeoutOption("2 seconds"),
    Effect.map(Option.getOrUndefined),
    Effect.orElseSucceed(() => undefined),
  );
});
