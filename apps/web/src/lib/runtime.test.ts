import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as PrimaryEnvironmentHttpClient from "../environments/primary/httpClient";
import {
  __setPrimaryHttpRunnerForTests,
  runPrimaryHttp,
  type PrimaryHttpEffectRunner,
} from "./runtime";

describe("runPrimaryHttp", () => {
  it("forwards an abort signal to the primary HTTP runner", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const runner: PrimaryHttpEffectRunner = <A, E>(
      _effect: Effect.Effect<A, E, PrimaryEnvironmentHttpClient.PrimaryEnvironmentHttpClient>,
      options?: Effect.RunOptions,
    ): Promise<A> => {
      receivedSignal = options?.signal;
      return Promise.resolve(undefined as A);
    };

    __setPrimaryHttpRunnerForTests(runner);
    try {
      await runPrimaryHttp(Effect.succeed("generated"), { signal: controller.signal });
      assert.equal(receivedSignal, controller.signal);
    } finally {
      __setPrimaryHttpRunnerForTests();
    }
  });
});
