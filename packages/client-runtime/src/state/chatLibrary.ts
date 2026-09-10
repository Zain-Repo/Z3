import type { ChatLibraryListInput, ChatLibraryUploadInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { PreparedConnection } from "../connection/model.ts";
import { environmentEndpointUrl } from "../environment/endpoint.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import { executeEnvironmentHttpRequest, makeEnvironmentHttpApiClient } from "../rpc/http.ts";
import { buildEnvironmentAuthHeaders, withEnvironmentCredentials } from "./environmentHttpAuth.ts";

/** Load attachment metadata without hydrating conversation histories. */
export const fetchChatLibrary = Effect.fn("clientRuntime.state.fetchChatLibrary")(function* (
  prepared: PreparedConnection,
  query: ChatLibraryListInput,
) {
  const url = environmentEndpointUrl(prepared.httpBaseUrl, "/api/chat/library");
  const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
  const client = yield* makeEnvironmentHttpApiClient(prepared.httpBaseUrl);
  const headers = yield* buildEnvironmentAuthHeaders(
    prepared.httpAuthorization,
    "GET",
    url,
    signer,
  );
  return yield* executeEnvironmentHttpRequest(
    url,
    15_000,
    withEnvironmentCredentials(
      prepared.httpAuthorization,
      client.chatLibrary.list({ headers, query }),
    ),
  );
});

/** Preserve the upload id across retries so an uncertain response cannot create duplicates. */
export const uploadChatLibraryFile = Effect.fn("clientRuntime.state.uploadChatLibraryFile")(
  function* (prepared: PreparedConnection, payload: ChatLibraryUploadInput) {
    const url = environmentEndpointUrl(prepared.httpBaseUrl, "/api/chat/library");
    const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
    const client = yield* makeEnvironmentHttpApiClient(prepared.httpBaseUrl);
    const headers = yield* buildEnvironmentAuthHeaders(
      prepared.httpAuthorization,
      "POST",
      url,
      signer,
    );
    return yield* executeEnvironmentHttpRequest(
      url,
      60_000,
      withEnvironmentCredentials(
        prepared.httpAuthorization,
        client.chatLibrary.upload({ headers, payload }),
      ),
    );
  },
);

export const removeChatLibraryFile = Effect.fn("clientRuntime.state.removeChatLibraryFile")(
  function* (prepared: PreparedConnection, attachmentId: string) {
    const url = environmentEndpointUrl(
      prepared.httpBaseUrl,
      `/api/chat/library/${encodeURIComponent(attachmentId)}`,
    );
    const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
    const client = yield* makeEnvironmentHttpApiClient(prepared.httpBaseUrl);
    const headers = yield* buildEnvironmentAuthHeaders(
      prepared.httpAuthorization,
      "DELETE",
      url,
      signer,
    );
    return yield* executeEnvironmentHttpRequest(
      url,
      15_000,
      withEnvironmentCredentials(
        prepared.httpAuthorization,
        client.chatLibrary.remove({ headers, params: { attachmentId } }),
      ),
    );
  },
);
