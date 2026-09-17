import { useMemo, useState } from "react";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import type { ImageGenerationModel, VideoGenerationModel } from "@t3tools/contracts";
import {
  Combobox, ComboboxTrigger, ComboboxPopup, ComboboxInput, ComboboxList,
  ComboboxGroup, ComboboxGroupLabel, ComboboxItem, ComboboxEmpty,
} from "../ui/combobox";

export interface MediaModelOption {
  readonly value: string;
  readonly name: string;
  readonly provider: string;
  readonly modelId: string;
  readonly detail: string;
}

export function imageModelOptions(entries: readonly { provider: string; model: ImageGenerationModel }[]): MediaModelOption[] {
  return entries.map(({ provider, model }) => {
    const references = model.supportedParameters.input_references;
    const supportsReferences = references && (references.type !== "boolean" || model.inputModalities.includes("image"));
    return {
      value: `${provider}:${model.id}`, modelId: model.id, name: model.name ?? model.id,
      provider: provider === "fal" ? "fal.ai" : provider === "civitai" ? "Civitai" : provider === "openrouter" ? "OpenRouter" : provider,
      detail: [
        supportsReferences
          ? references.type === "range"
            ? `${references.min > 0 ? "Requires" : "Up to"} ${references.min > 0 ? references.min : references.max} reference image${(references.min > 0 ? references.min : references.max) === 1 ? "" : "s"}`
            : "Supports reference images"
          : "Text to image",
        model.civitai ? `Civitai LoRAs (${model.civitai.maxLoras} max)` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
}

export function videoModelOptions(models: readonly VideoGenerationModel[]): MediaModelOption[] {
  return models.map((model) => ({
    value: model.id, modelId: model.id,
    name: (model.name ?? model.id).replace(/\s*\(fal\.ai\)$/, ""),
    provider: model.id.startsWith("fal/") ? "fal.ai" : "OpenRouter",
    detail: [
      model.requiredFrameImages?.includes("first_frame") ? "First frame required"
        : model.supportedFrameImages.includes("last_frame") ? "First / last frame support"
        : model.supportedFrameImages.includes("first_frame") ? "First frame support"
        : model.upscaleFactor ? "Video upscaling" : "Video generation",
      model.supportedDurations.length ? `${model.supportedDurations.join(" / ")}s` : "",
    ].filter(Boolean).join(" · "),
  }));
}

export function filterMediaModels(options: readonly MediaModelOption[], query: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return options.filter((option) => {
    const text = `${option.name} ${option.modelId} ${option.provider} ${option.detail}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

/** Shared searchable picker for canvas cards and the standalone video workspace. */
export function MediaModelPicker({ options, value, onChange, kind, disabled = false }: {
  readonly options: readonly MediaModelOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly kind: "image" | "video";
  readonly disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => filterMediaModels(options, query), [options, query]);
  const groups = useMemo(() => {
    const grouped = new Map<string, MediaModelOption[]>();
    for (const option of filtered) {
      const group = grouped.get(option.provider) ?? [];
      group.push(option);
      grouped.set(option.provider, group);
    }
    return [...grouped];
  }, [filtered]);
  return (
    <div className="min-w-0 space-y-1">
      <Combobox
        items={options.map((option) => option.value)}
        filteredItems={groups.flatMap(([, items]) => items.map((item) => item.value))}
        value={selected?.value ?? null}
        disabled={disabled || options.length === 0}
        onOpenChange={() => setQuery("")}
        onValueChange={(next) => { if (next) onChange(next); }}
      >
        <ComboboxTrigger aria-label={`${kind} model`} className="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
          <span className="min-w-0 flex-1 truncate">{selected?.name ?? (value ? "Selected model unavailable" : "Choose a model")}</span>
          {selected && <span className="shrink-0 text-[10px] text-muted-foreground">{selected.provider}</span>}
          <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        </ComboboxTrigger>
        <ComboboxPopup className="w-80 max-w-[calc(100vw-1rem)]" onPointerDown={(event) => event.stopPropagation()}>
          <div className="border-b border-border p-2">
            <ComboboxInput aria-label={`Search ${kind} models`} placeholder="Search models or providers…" showTrigger={false} size="sm" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <ComboboxEmpty>No matching models.</ComboboxEmpty>
          <ComboboxList>
            {groups.map(([provider, items]) => (
              <ComboboxGroup key={provider}>
                <ComboboxGroupLabel>{provider} · {items.length}</ComboboxGroupLabel>
                {items.map((option) => (
                  <ComboboxItem key={option.value} value={option.value}>
                    <div className="flex min-w-0 items-center gap-2 py-1">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium" title={option.modelId}>{option.name}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{option.detail}</div>
                      </div>
                      {option.value === value && <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />}
                    </div>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            ))}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
      <p className="text-[11px] text-muted-foreground">
        {selected?.detail ?? (options.length ? "Choose an available model." : "Configure a provider in Settings, then refresh models.")}
      </p>
    </div>
  );
}
