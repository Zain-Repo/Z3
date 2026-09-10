import { useEffect, useRef, useState } from "react";
import { Effect } from "effect";
import type {
  ImageGenerationInput,
  ImageGenerationModel,
  ProviderInstanceId,
} from "@t3tools/contracts";

import { PrimaryEnvironmentHttpClient } from "../../environments/primary/httpClient";
import { runPrimaryHttp } from "../../lib/runtime";
import { Button } from "../ui/button";

type CivitaiOptions = NonNullable<ImageGenerationInput["civitai"]>;
type Resource = {
  readonly air: string;
  readonly name: string;
  readonly versionName: string;
  readonly baseModel: string;
  readonly trainedWords: readonly string[];
};

const fieldClass =
  "mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ResourceSearch({
  model,
  providerInstanceId,
  checkpoint,
  type,
  selected,
  disabled,
  onSelect,
}: {
  readonly model: ImageGenerationModel;
  readonly providerInstanceId?: ProviderInstanceId | undefined;
  readonly checkpoint?: string | undefined;
  readonly type: "Checkpoint" | "LORA";
  readonly selected: readonly string[];
  readonly disabled: boolean;
  readonly onSelect: (resource: Resource) => void;
}) {
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState<readonly Resource[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const label = type === "Checkpoint" ? "checkpoints" : "LoRAs";

  useEffect(() => {
    setResources([]);
    setCursor(undefined);
    setSearched(false);
    setLoading(false);
    setError("");
    return () => {
      request.current?.abort();
    };
  }, [model.id, providerInstanceId, type, checkpoint]);

  async function search(nextCursor?: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    if (!nextCursor) setResources([]);
    try {
      const result = await runPrimaryHttp(
        PrimaryEnvironmentHttpClient.pipe(
          Effect.flatMap((client) =>
            client.imageGeneration.searchCivitaiResources({
              query: {
                model: model.id,
                type,
                ...(checkpoint ? { checkpoint } : {}),
                ...(query.trim() ? { query: query.trim() } : {}),
                ...(nextCursor ? { cursor: nextCursor } : {}),
                ...(providerInstanceId ? { providerInstanceId } : {}),
              },
              headers: {},
            }),
          ),
          Effect.map((data) => ({ data })),
          Effect.catchTag("EnvironmentHttpBadRequestError", (error) =>
            Effect.succeed({ error: error.message }),
          ),
        ),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if ("error" in result) {
        setError(result.error);
        setCursor(undefined);
        return;
      }
      setResources((current) => {
        const merged = new Map(
          (nextCursor ? current : []).map((resource) => [resource.air, resource]),
        );
        for (const resource of result.data.resources) merged.set(resource.air, resource);
        return Array.from(merged.values());
      });
      setCursor(result.data.nextCursor);
      setSearched(true);
    } catch {
      if (!controller.signal.aborted)
        setError(
          `Could not search Civitai ${label}. Check your connection and API key, then try again.`,
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-muted-foreground">
          Search {label}
          <input
            className={fieldClass}
            value={query}
            maxLength={200}
            disabled={disabled || loading}
            placeholder="Name, keyword, or Civitai model link"
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(undefined);
              setResources([]);
              setSearched(false);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || loading}
          onClick={() => void search()}
        >
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {searched && resources.length === 0 && !loading && !error ? (
        <p role="status" className="text-xs text-muted-foreground">
          No compatible {label} found. Try another search.
        </p>
      ) : null}
      {resources.length > 0 ? (
        <ul
          aria-label={`Civitai ${label}`}
          className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border/60 p-2"
        >
          {resources.map((resource) => (
            <li
              key={resource.air}
              className="space-y-1 border-b border-border/50 pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 text-xs">
                  <p className="break-words font-medium">{resource.name}</p>
                  <p className="break-words text-muted-foreground">
                    {resource.versionName} · {resource.baseModel}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled || selected.includes(resource.air)}
                  aria-label={`${type === "Checkpoint" ? "Use" : "Add"} ${resource.name}, ${resource.versionName}`}
                  onClick={() => onSelect(resource)}
                >
                  {selected.includes(resource.air)
                    ? "Selected"
                    : type === "Checkpoint"
                      ? "Use"
                      : "Add"}
                </Button>
              </div>
              {resource.trainedWords.length > 0 ? (
                <p className="break-words text-[11px] text-muted-foreground">
                  Trigger words: {resource.trainedWords.join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {cursor ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || loading}
          onClick={() => void search(cursor)}
        >
          Load more {label}
        </Button>
      ) : null}
    </div>
  );
}

export function CivitaiAdvancedSettings({
  model,
  providerInstanceId,
  value,
  onChange,
  disabled,
}: {
  readonly model: ImageGenerationModel;
  readonly providerInstanceId?: ProviderInstanceId | undefined;
  readonly value: CivitaiOptions;
  readonly onChange: (value: CivitaiOptions) => void;
  readonly disabled: boolean;
}) {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [triggers, setTriggers] = useState<ReadonlyMap<string, readonly string[]>>(new Map());
  const capabilities = model.civitai;
  if (!capabilities)
    return (
      <p className="text-xs text-muted-foreground">
        Custom LoRAs are not available for this Civitai route in ZImage. Choose a model with LoRA
        support to customize its resources.
      </p>
    );
  const loras = value.loras ?? [];
  const recommendations = capabilities.recommendedCheckpoints ?? [];
  const recommendedSelection = recommendations.find((entry) => entry.air === value.checkpoint);

  function remember(resource: Resource) {
    setTriggers((current) => new Map(current).set(resource.air, resource.trainedWords));
    setNames((current) =>
      new Map(current).set(resource.air, `${resource.name} · ${resource.versionName}`),
    );
  }

  function updateNumber(field: "steps" | "cfgScale", text: string) {
    const next = { ...value };
    if (text === "") delete next[field];
    else {
      const number = Number(text);
      if (!Number.isFinite(number)) return;
      next[field] = number;
    }
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {capabilities.checkpoint !== "unsupported" ? (
        <div className="space-y-2">
          <p className="text-xs font-medium">
            Checkpoint{capabilities.checkpoint === "required" ? " (required)" : ""}
          </p>
          {recommendations.length > 0 ? (
            <label className="block text-xs text-muted-foreground">
              Realistic checkpoints
              <select
                className={fieldClass}
                value={recommendedSelection?.air ?? ""}
                disabled={disabled}
                onChange={(event) => {
                  const resource = recommendations.find(
                    (entry) => entry.air === event.target.value,
                  );
                  if (!resource) return;
                  remember(resource);
                  onChange({ ...value, checkpoint: resource.air, loras: [] });
                }}
              >
                <option value="" disabled>
                  Choose a realistic checkpoint
                </option>
                {recommendations.map((resource) => (
                  <option key={resource.air} value={resource.air}>
                    {resource.name} · {resource.versionName} ({resource.baseModel})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px]">
                Photographic options for this model family. Availability is checked before
                generation.
              </span>
            </label>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Search this model family by name or paste a Civitai model link, including a version
              link to select that exact checkpoint.
            </p>
          )}
          {value.checkpoint ? (
            <div className="flex items-center gap-2 rounded-md border border-border/60 p-2">
              <span className="min-w-0 flex-1 break-words text-xs">
                {names.get(value.checkpoint) ??
                  (recommendedSelection
                    ? `${recommendedSelection.name} · ${recommendedSelection.versionName}`
                    : value.checkpoint)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  const next = { ...value };
                  delete next.checkpoint;
                  delete next.loras;
                  onChange(next);
                }}
              >
                Clear checkpoint
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {capabilities.checkpoint === "required"
                ? "Choose a compatible checkpoint before generating."
                : "Using the model’s default checkpoint."}
            </p>
          )}
          <ResourceSearch
            model={model}
            {...(providerInstanceId ? { providerInstanceId } : {})}
            type="Checkpoint"
            selected={value.checkpoint ? [value.checkpoint] : []}
            disabled={disabled}
            onSelect={(resource) => {
              remember(resource);
              onChange({ ...value, checkpoint: resource.air, loras: [] });
            }}
          />
        </div>
      ) : null}
      {capabilities.maxLoras > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium">
            LoRAs ({loras.length}/{capabilities.maxLoras})
          </p>
          <p className="text-[11px] text-muted-foreground">
            Compatible base models: {capabilities.ecosystems.join(", ")}.
            {capabilities.checkpoint !== "unsupported"
              ? " Selecting a checkpoint narrows the search to its base model."
              : " Search only includes resources for this model variant."}
          </p>
          {loras.map((lora) => (
            <div key={lora.air} className="space-y-2 rounded-md border border-border/60 p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-words text-xs">
                  {names.get(lora.air) ?? lora.air}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  aria-label={`Remove ${names.get(lora.air) ?? lora.air}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      loras: loras.filter((candidate) => candidate.air !== lora.air),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
              {(triggers.get(lora.air)?.length ?? 0) > 0 ? (
                <p className="break-words text-[11px] text-muted-foreground">
                  Trigger words: {triggers.get(lora.air)?.join(", ")}
                </p>
              ) : null}
              <label className="block text-xs text-muted-foreground">
                Strength: {lora.strength}
                <input
                  type="range"
                  min={capabilities.strength.min}
                  max={capabilities.strength.max}
                  step={0.05}
                  value={lora.strength}
                  disabled={disabled}
                  className="mt-2 w-full accent-primary"
                  aria-label={`Strength for ${names.get(lora.air) ?? lora.air}`}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      loras: loras.map((candidate) =>
                        candidate.air === lora.air
                          ? { ...candidate, strength: Number(event.target.value) }
                          : candidate,
                      ),
                    })
                  }
                />
              </label>
            </div>
          ))}
          <ResourceSearch
            model={model}
            {...(providerInstanceId ? { providerInstanceId } : {})}
            type="LORA"
            checkpoint={value.checkpoint}
            selected={loras.map((lora) => lora.air)}
            disabled={disabled || loras.length >= capabilities.maxLoras}
            onSelect={(resource) => {
              if (
                loras.some((lora) => lora.air === resource.air) ||
                loras.length >= capabilities.maxLoras
              )
                return;
              remember(resource);
              onChange({
                ...value,
                loras: [
                  ...loras,
                  {
                    air: resource.air,
                    strength: Math.max(
                      capabilities.strength.min,
                      Math.min(capabilities.strength.max, 1),
                    ),
                  },
                ],
              });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Use the listed trigger words in your prompt when the LoRA requires them. Resource fees
            may apply.
          </p>
        </div>
      ) : null}
      {capabilities.negativePrompt ? (
        <label className="block text-xs text-muted-foreground">
          Negative prompt
          <textarea
            value={value.negativePrompt ?? ""}
            maxLength={10000}
            disabled={disabled}
            placeholder="Details to avoid"
            className="mt-1 min-h-16 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => {
              const next = { ...value };
              if (event.target.value) next.negativePrompt = event.target.value;
              else delete next.negativePrompt;
              onChange(next);
            }}
          />
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {(["steps", "cfgScale"] as const).map((field) => {
          const range = capabilities[field];
          return range ? (
            <label key={field} className="text-xs text-muted-foreground">
              {field === "steps" ? "Sampling steps" : "Guidance (CFG)"}
              <input
                type="number"
                min={range.min}
                max={range.max}
                step={field === "steps" ? 1 : 0.1}
                value={value[field] ?? ""}
                placeholder="Provider default"
                disabled={disabled}
                className={fieldClass}
                onChange={(event) => updateNumber(field, event.target.value)}
              />
              <span className="mt-1 block text-[11px]">
                {range.min}–{range.max}
              </span>
            </label>
          ) : null;
        })}
      </div>
    </div>
  );
}
