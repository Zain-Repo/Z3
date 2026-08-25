import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { DeepSeekSettings } from "@t3tools/contracts";
import { checkDeepSeekProvider, makePendingDeepSeekProvider } from "./DeepSeekProvider.ts";

const settings = Schema.decodeSync(DeepSeekSettings)({});

describe("DeepSeekProvider", () => {
  it.effect("uses the configured default model when no API key is present", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkDeepSeekProvider(settings, true, undefined);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.auth.status).toBe("unauthenticated");
      expect(snapshot.models.map((model) => model.slug)).toContain("deepseek-v4-flash");
      expect(snapshot.message).toContain("DEEPSEEK_API_KEY");
    }),
  );

  it.effect("builds a pending snapshot without contacting the network", () =>
    Effect.gen(function* () {
      const snapshot = yield* makePendingDeepSeekProvider(settings, true);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.installed).toBe(true);
      expect(snapshot.models[0]?.slug).toBe("deepseek-v4-flash");
    }),
  );
});
