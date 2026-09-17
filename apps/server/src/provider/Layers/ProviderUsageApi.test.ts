import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { fetchProviderUsage } from "./ProviderUsageApi.ts";
import { OpenRouterSettings } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { checkOpenRouterProvider } from "./OpenRouterProvider.ts";

const decodeSettings = Schema.decodeSync(OpenRouterSettings);

it.effect("reads usage from the configured instance endpoint", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) => {
      expect(request.url).toBe("https://example.test/api/v1/key");
      expect(request.headers.authorization).toBe("Bearer test-key");
      return Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response(JSON.stringify({ data: { usage: 2.5 } }))),
      );
    });
    expect(
      yield* fetchProviderUsage(client, "https://example.test/api/v1/", "test-key", "openrouter"),
    ).toEqual({ metrics: [{ label: "All-time key spend", value: 2.5, unit: "USD" }] });
  }),
);

it.effect("keeps provider availability independent of usage failures", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          request.url.endsWith("/key")
            ? new Response("unavailable", { status: 503 })
            : Response.json({ data: [] }),
        ),
      ),
    );
    const snapshot = yield* checkOpenRouterProvider(decodeSettings({}), true, "test-key", client);
    expect(snapshot.status).toBe("ready");
    expect(snapshot.auth.status).toBe("authenticated");
    expect(snapshot.usage).toBeUndefined();
  }),
);

it.effect("reads DeepSeek balances without converting currencies", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) => {
      expect(request.url).toBe("https://example.test/user/balance");
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json({ balance_infos: [{ currency: "CNY", total_balance: "10.50" }] }),
        ),
      );
    });
    expect(
      yield* fetchProviderUsage(client, "https://example.test", "test-key", "deepseek"),
    ).toEqual({ metrics: [{ label: "Account balance", value: 10.5, unit: "CNY" }] });
  }),
);

it.effect("isolates authentication and malformed response failures", () =>
  Effect.gen(function* () {
    for (const response of [
      new Response("denied", { status: 401 }),
      new Response("invalid json"),
    ]) {
      const client = HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, response)),
      );
      expect(
        yield* fetchProviderUsage(client, "https://example.test", "test-key", "openrouter"),
      ).toBeUndefined();
    }
  }),
);
