import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../../components/AppText";
import { useServerConfigs } from "../../../state/entities";
import { useSavedRemoteConnections } from "../../../state/use-remote-environment-registry";
import { useAtomCommand } from "../../../state/use-atom-command";
import { serverEnvironment } from "../../../state/server";
import { SettingsSection } from "./SettingsSection";

export function ProviderUsageSection() {
  const configs = useServerConfigs();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const refresh = useAtomCommand(serverEnvironment.refreshProviders, "refresh provider usage");
  const [refreshing, setRefreshing] = useState(false);
  const entries = [...configs].flatMap(([environmentId, config]) =>
    config.providers
      .filter((provider) => provider.enabled && provider.auth.status === "authenticated")
      .map((provider) => ({ environmentId, provider })),
  );
  return (
    <SettingsSection title="Usage summary">
      <View className="gap-3 p-4">
        <Text className="text-sm text-foreground-muted">
          Provider-reported usage, including activity outside Z3. OpenRouter amounts apply to the
          connected key.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={refreshing || configs.size === 0}
          onPress={() => {
            setRefreshing(true);
            void Promise.all(
              [...configs.keys()].map((environmentId) => refresh({ environmentId, input: {} })),
            ).finally(() => setRefreshing(false));
          }}
          className="min-h-11 justify-center"
        >
          <Text className="text-sm text-foreground">
            {refreshing ? "Refreshing usage…" : "Refresh usage"}
          </Text>
        </Pressable>
        {entries.length === 0 && (
          <Text className="text-sm text-foreground-muted">
            Connect a provider to see its usage.
          </Text>
        )}
        {entries.map(({ environmentId, provider }) => (
          <View key={`${environmentId}:${provider.instanceId}`} className="gap-2">
            <Text className="text-sm font-t3-medium text-foreground">
              {provider.displayName ?? provider.driver} ·{" "}
              {savedConnectionsById[environmentId]?.environmentLabel ?? environmentId}
            </Text>
            {provider.usage?.metrics.length ? (
              provider.usage.metrics.map((metric) => (
                <View key={`${metric.label}:${metric.unit}`}>
                  <Text className="text-sm text-foreground">
                    {metric.label}:{" "}
                    {metric.unit === "percent"
                      ? `${metric.value}%`
                      : new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: metric.unit,
                        }).format(metric.value)}
                  </Text>
                  {metric.resetsAt && (
                    <Text className="text-xs text-foreground-muted">
                      Resets {new Date(metric.resetsAt).toLocaleString()}
                    </Text>
                  )}
                </View>
              ))
            ) : (
              <Text className="text-sm text-foreground-muted">
                Usage reporting is unavailable for this connection.
              </Text>
            )}
            <Text className="text-xs text-foreground-muted">
              Checked {new Date(provider.checkedAt).toLocaleString()}
            </Text>
          </View>
        ))}
      </View>
    </SettingsSection>
  );
}
