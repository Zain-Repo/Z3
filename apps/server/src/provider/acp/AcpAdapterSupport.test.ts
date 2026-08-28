import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as EffectAcpErrors from "effect-acp/errors";
import { ProviderDriverKind, type ProviderOptionSelection } from "@t3tools/contracts";

import {
  acpPermissionOutcome,
  applyAcpModelOptionSelections,
  mapAcpToAdapterError,
  selectAcpAutoApprovedPermissionOption,
  selectAcpPermissionOptionId,
} from "./AcpAdapterSupport.ts";

describe("AcpAdapterSupport", () => {
  it.effect("applies selected effort and service tier values advertised by ACP", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [string, string | boolean]> = [];
      const runtime = {
        getConfigOptions: Effect.succeed([
          {
            id: "reasoning",
            name: "Reasoning effort",
            category: "model_config",
            type: "select",
            currentValue: "low",
            options: [
              { value: "low", name: "Low" },
              { value: "high", name: "High" },
            ],
          },
          {
            id: "service_tier",
            name: "Service Tier",
            category: "model_config",
            type: "select",
            currentValue: "standard",
            options: [
              { value: "standard", name: "Standard" },
              { value: "priority", name: "Priority" },
            ],
          },
        ]),
        setConfigOption: (id: string, value: string | boolean) => {
          calls.push([id, value]);
          return Effect.succeed({ configOptions: [] });
        },
      } as never;

      yield* applyAcpModelOptionSelections({
        runtime,
        selections: [
          { id: "effort", value: "high" },
          { id: "serviceTier", value: "priority" },
        ] satisfies ReadonlyArray<ProviderOptionSelection>,
        mapError: (cause) => cause,
      });

      expect(calls).toEqual([
        ["reasoning", "high"],
        ["service_tier", "priority"],
      ]);
    }),
  );

  it.effect("maps equivalent advertised values and ignores unsupported selections", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [string, string | boolean]> = [];
      const runtime = {
        getConfigOptions: Effect.succeed([
          {
            id: "thinking",
            name: "Thinking",
            category: "model_config",
            type: "boolean",
            currentValue: false,
          },
          {
            id: "effort",
            name: "Effort",
            category: "model_config",
            type: "select",
            currentValue: "medium",
            options: [
              { value: "medium", name: "Medium" },
              { value: "x-high", name: "Extra High" },
            ],
          },
        ]),
        setConfigOption: (id: string, value: string | boolean) => {
          calls.push([id, value]);
          return Effect.succeed({ configOptions: [] });
        },
      } as never;

      yield* applyAcpModelOptionSelections({
        runtime,
        selections: [
          { id: "thinking", value: true },
          { id: "variant", value: "x_high" },
          { id: "missing", value: "ignored" },
        ] satisfies ReadonlyArray<ProviderOptionSelection>,
        mapError: (cause) => cause,
      });

      expect(calls).toEqual([
        ["thinking", true],
        ["effort", "x-high"],
      ]);
    }),
  );

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
