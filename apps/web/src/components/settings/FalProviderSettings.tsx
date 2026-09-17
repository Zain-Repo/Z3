import { useState } from "react";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";

import { usePrimarySettings } from "../../hooks/useSettings";
import { usePrimaryEnvironment } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { searchableSetting } from "./settingsSearch";

const FAL_INSTANCE_ID = ProviderInstanceId.make("fal");

export function FalProviderSettings() {
  const settings = usePrimarySettings();
  const environment = usePrimaryEnvironment();
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const instance = settings.providerInstances[FAL_INSTANCE_ID];
  const configured =
    instance?.environment?.some(
      (variable) =>
        variable.name === "FAL_KEY" && (variable.valueRedacted || variable.value.length > 0),
    ) ?? false;

  async function save(enabled: boolean, key?: string) {
    if (!environment || saving) return;
    setSaving(true);
    setMessage("");
    const variables = instance?.environment ?? [];
    const result = await updateSettings({
      environmentId: environment.environmentId,
      input: {
        patch: {
          providerInstances: {
            ...settings.providerInstances,
            [FAL_INSTANCE_ID]: {
              ...instance,
              driver: ProviderDriverKind.make("fal"),
              enabled,
              config: instance?.config ?? {},
              environment:
                key === undefined
                  ? variables
                  : [
                      ...variables.filter((variable) => variable.name !== "FAL_KEY"),
                      ...(key.length > 0
                        ? [
                            {
                              name: "FAL_KEY",
                              value: key,
                              sensitive: true,
                              valueRedacted: false,
                            },
                          ]
                        : []),
                    ],
            },
          },
        },
      },
    });
    setSaving(false);
    if (result._tag === "Success") {
      setApiKey("");
      setMessage(key === "" ? "API key removed." : "fal.ai settings saved.");
    } else {
      setMessage("Could not save fal.ai settings. Try again.");
    }
  }

  return (
    <div
      id={searchableSetting("fal-generation").id}
      className="space-y-3 rounded-xl border border-border/70 bg-card/20 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">fal.ai</h3>
          <p className="text-xs text-muted-foreground">Image and video generation for ZImage.</p>
        </div>
        <Switch
          aria-label="Enable fal.ai image and video generation"
          checked={instance?.enabled ?? false}
          disabled={saving || !environment}
          onCheckedChange={(enabled) => void save(enabled)}
        />
      </div>
      <label htmlFor="fal-api-key" className="block text-xs font-medium">
        API key
      </label>
      <Input
        id="fal-api-key"
        type="password"
        autoComplete="off"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder={
          configured ? "API key saved — enter a replacement" : "Enter your fal.ai API key"
        }
        disabled={saving || !environment}
      />
      <p className="text-xs text-muted-foreground">
        Your key is stored securely on this environment. fal.ai generation uses your account’s
        credit balance. Create a key at{" "}
        <a
          href="https://fal.ai/dashboard/keys"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          fal.ai
        </a>
        .
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={saving || !environment || !apiKey.trim()}
          onClick={() => void save(true, apiKey.trim())}
        >
          {saving ? "Saving…" : configured ? "Replace API key" : "Save API key"}
        </Button>
        {configured && (
          <Button
            size="sm"
            variant="outline"
            disabled={saving || !environment}
            onClick={() => void save(false, "")}
          >
            Remove API key
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
