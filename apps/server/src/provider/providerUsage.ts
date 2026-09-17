import type { ServerProviderUsage } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Keep only displayable quota fields; account identifiers and credentials never cross the wire. */
export function codexUsage(value: unknown): ServerProviderUsage {
  const response = record(value);
  const buckets = record(response.rateLimitsByLimitId);
  const entries =
    Object.keys(buckets).length > 0
      ? Object.entries(buckets)
      : ([["Codex", response.rateLimits]] as const);
  const metrics: Array<ServerProviderUsage["metrics"][number]> = [];
  for (const [id, raw] of entries) {
    const bucket = record(raw);
    for (const key of ["primary", "secondary"] as const) {
      const window = record(bucket[key]);
      if (!finite(window.usedPercent)) continue;
      const minutes = window.windowDurationMins;
      const period = finite(minutes)
        ? minutes >= 1440
          ? `${minutes / 1440}-day`
          : `${minutes / 60}-hour`
        : key;
      const reset = finite(window.resetsAt) ? DateTime.make(window.resetsAt * 1000) : Option.none();
      metrics.push({
        label: `${typeof bucket.limitName === "string" ? bucket.limitName : id} · ${period} used`,
        value: Math.min(100, window.usedPercent),
        unit: "percent",
        ...(Option.isSome(reset) ? { resetsAt: DateTime.formatIso(reset.value) } : {}),
      });
    }
  }
  return { metrics };
}

export function openRouterUsage(value: unknown): ServerProviderUsage {
  const data = record(record(value).data);
  const metrics: Array<ServerProviderUsage["metrics"][number]> = [];
  for (const [field, label] of [
    ["usage_daily", "Today (UTC)"],
    ["usage_weekly", "This week (UTC)"],
    ["usage_monthly", "This month (UTC)"],
    ["usage", "All-time key spend"],
    ["limit_remaining", "Key allowance remaining"],
    ["byok_usage_monthly", "BYOK this month (UTC)"],
  ] as const) {
    if (finite(data[field])) metrics.push({ label, value: data[field], unit: "USD" });
  }
  return { metrics };
}

export function deepSeekUsage(value: unknown): ServerProviderUsage {
  const balances = record(value).balance_infos;
  const metrics: Array<ServerProviderUsage["metrics"][number]> = [];
  if (!Array.isArray(balances)) return { metrics };
  for (const raw of balances) {
    const balance = record(raw);
    if (balance.currency !== "USD" && balance.currency !== "CNY") continue;
    if (typeof balance.total_balance !== "string" || !balance.total_balance.trim()) continue;
    const amount = Number(balance.total_balance);
    if (!Number.isFinite(amount)) continue;
    metrics.push({ label: "Account balance", value: amount, unit: balance.currency });
  }
  return { metrics };
}
