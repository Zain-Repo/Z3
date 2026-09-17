import { describe, expect, it } from "vite-plus/test";
import { codexUsage, deepSeekUsage, openRouterUsage } from "./providerUsage.ts";

describe("provider usage", () => {
  it("prefers named Codex buckets without duplicating the legacy bucket", () => {
    const window = { usedPercent: 31, windowDurationMins: 300, resetsAt: 1730948100 };
    expect(
      codexUsage({
        rateLimits: { primary: window },
        rateLimitsByLimitId: { codex: { primary: window } },
      }).metrics,
    ).toEqual([
      {
        label: "codex · 5-hour used",
        value: 31,
        unit: "percent",
        resetsAt: "2024-11-07T02:55:00.000Z",
      },
    ]);
  });
  it("handles legacy Codex limits and missing or invalid windows", () => {
    expect(
      codexUsage({ rateLimits: { primary: { usedPercent: 0 }, secondary: { usedPercent: NaN } } })
        .metrics,
    ).toEqual([{ label: "Codex · primary used", value: 0, unit: "percent" }]);
    expect(codexUsage(null).metrics).toEqual([]);
  });
  it("keeps zero spend, omits unlimited allowances, and separates BYOK", () => {
    expect(
      openRouterUsage({
        data: {
          usage_daily: 0,
          usage: 12,
          limit_remaining: null,
          byok_usage_monthly: 3,
          usage_weekly: -1,
          usage_monthly: "4",
        },
      }).metrics,
    ).toEqual([
      { label: "Today (UTC)", value: 0, unit: "USD" },
      { label: "All-time key spend", value: 12, unit: "USD" },
      { label: "BYOK this month (UTC)", value: 3, unit: "USD" },
    ]);
  });
  it("preserves DeepSeek currencies and negative balances without accepting malformed values", () => {
    expect(
      deepSeekUsage({
        balance_infos: [
          { currency: "USD", total_balance: "-1.25" },
          { currency: "CNY", total_balance: "100" },
          { currency: "USD", total_balance: "" },
          { currency: "USD", total_balance: "NaN" },
        ],
      }).metrics,
    ).toEqual([
      { label: "Account balance", value: -1.25, unit: "USD" },
      { label: "Account balance", value: 100, unit: "CNY" },
    ]);
  });
});
