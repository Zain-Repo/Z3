import type { ServerProvider } from "@t3tools/contracts";
import { SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { Button } from "../ui/button";

export function ProviderUsageSummary({
  providers,
  refreshing,
  onRefresh,
}: {
  providers: ReadonlyArray<ServerProvider>;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const connected = providers.filter(
    (provider) => provider.enabled && provider.auth.status === "authenticated",
  );
  return (
    <SettingsSection
      {...searchableSetting("provider-usage")}
      headerAction={
        <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? "Refreshing…" : "Refresh usage"}
        </Button>
      }
    >
      <p className="px-4 text-xs text-muted-foreground">
        Usage reported by your connected providers. Refresh provider status to update. OpenRouter
        amounts apply to the connected key, including use outside Z3.
      </p>
      {connected.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Connect a provider to see its usage.
        </p>
      ) : (
        connected.map((provider) => (
          <div
            key={provider.instanceId}
            className="space-y-3 border-b border-border px-4 py-4 last:border-b-0"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{provider.displayName ?? provider.driver}</h3>
              <span className="text-xs text-muted-foreground">
                Checked {new Date(provider.checkedAt).toLocaleString()}
              </span>
            </div>
            {provider.usage?.metrics.length ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {provider.usage.metrics.map((metric) => (
                  <div key={`${metric.label}-${metric.unit}`}>
                    <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                    <dd className="text-sm tabular-nums">
                      {metric.unit === "percent"
                        ? `${metric.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
                        : new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: metric.unit,
                          }).format(metric.value)}
                      {metric.resetsAt && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          Resets {new Date(metric.resetsAt).toLocaleString()}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">
                {provider.driver === "codex" ||
                provider.driver === "openrouter" ||
                provider.driver === "deepseek"
                  ? "Usage unavailable for this connection. Try refreshing provider status."
                  : "Usage reporting is not available for this provider connection."}
              </p>
            )}
          </div>
        ))
      )}
    </SettingsSection>
  );
}
