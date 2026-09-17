import { HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { expect, it } from "vite-plus/test";
import { promptRewriteError } from "./flowApi";

it("explains how to recover when an older server does not have prompt rewriting", () => {
  const request = HttpClientRequest.post("http://localhost/api/images/prompts/rewrite");
  const response = HttpClientResponse.fromWeb(request, new Response("Not found", { status: 404 }));
  const error = new HttpClientError.HttpClientError({
    reason: new HttpClientError.DecodeError({ request, response }),
  });
  expect(promptRewriteError(error).message).toContain(
    "Update or rebuild Z3, then restart the server",
  );
});

it("preserves provider errors so the user can resolve them", () => {
  const error = new Error("Connect a Codex or OpenRouter account.");
  expect(promptRewriteError(error)).toBe(error);
});
