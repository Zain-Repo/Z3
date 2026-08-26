import { describe, expect, it } from "vite-plus/test";
import * as EffectAcpErrors from "effect-acp/errors";
import { ProviderDriverKind } from "@t3tools/contracts";

import {
  acpPermissionOutcome,
  mapAcpToAdapterError,
  selectAcpAutoApprovedPermissionOption,
  selectAcpPermissionOptionId,
} from "./AcpAdapterSupport.ts";

describe("AcpAdapterSupport", () => {
  it("maps ACP approval decisions to permission outcomes", () => {
    expect(acpPermissionOutcome("accept")).toBe("allow-once");
    expect(acpPermissionOutcome("acceptForSession")).toBe("allow-always");
    expect(acpPermissionOutcome("decline")).toBe("reject-once");
  });

  it("maps ACP request errors to provider adapter request errors", () => {
    const error = mapAcpToAdapterError(
      ProviderDriverKind.make("cursor"),
      "thread-1" as never,
      "session/prompt",
      new EffectAcpErrors.AcpRequestError({
        code: -32602,
        errorMessage: "Invalid params",
      }),
    );

    expect(error._tag).toBe("ProviderAdapterRequestError");
    expect(error.message).toContain("Invalid params");
  });

  it("selects the matching ACP permission option id by kind", () => {
    const request = {
      options: [
        { optionId: "allow_once", kind: "allow_once" },
        { optionId: "allow_always", kind: "allow_always" },
        { optionId: "reject_once", kind: "reject_once" },
      ],
    } as never;

    expect(selectAcpPermissionOptionId(request, "accept")).toBe("allow_once");
    expect(selectAcpPermissionOptionId(request, "acceptForSession")).toBe("allow_always");
    expect(selectAcpPermissionOptionId(request, "decline")).toBe("reject_once");
  });

  it("prefers allow-always then allow-once for auto-approval", () => {
    const withAlways = {
      options: [
        { optionId: "allow_once", kind: "allow_once" },
        { optionId: "allow_always", kind: "allow_always" },
      ],
    } as never;
    const withoutAlways = {
      options: [{ optionId: "allow_once", kind: "allow_once" }],
    } as never;

    expect(selectAcpAutoApprovedPermissionOption(withAlways)).toBe("allow_always");
    expect(selectAcpAutoApprovedPermissionOption(withoutAlways)).toBe("allow_once");
  });
});
