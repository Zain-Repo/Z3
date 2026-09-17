import type { ImageCreativeDirection } from "@t3tools/contracts";
import {
  DEFAULT_IMAGE_DIRECTION,
  IMAGE_STYLE_PRESETS,
} from "@t3tools/shared/imageCreativeDirection";
import { cn } from "../../lib/utils";

export function CreativeDirectionPanel({
  value,
  onChange,
  preview,
  disabled,
}: {
  readonly value: ImageCreativeDirection | undefined;
  readonly onChange: (value: ImageCreativeDirection | undefined) => void;
  readonly preview: string;
  readonly disabled: boolean;
}) {
  return (
    <section className="space-y-4 pt-5" aria-label="Creative direction">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Creative direction</h3>
          <p className="mt-1 text-xs text-muted-foreground">Shape the image, keep your intent.</p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="size-4 accent-current"
            checked={value !== undefined}
            disabled={disabled}
            onChange={(event) =>
              onChange(event.target.checked ? DEFAULT_IMAGE_DIRECTION : undefined)
            }
          />
          Enabled
        </label>
      </div>
      {value ? (
        <>
          <div role="group" aria-label="Image style" className="grid grid-cols-2 gap-2">
            {IMAGE_STYLE_PRESETS.map((style) => (
              <button
                key={style.id}
                type="button"
                disabled={disabled}
                aria-pressed={value.style === style.id}
                onClick={() => onChange({ ...value, style: style.id })}
                className={cn(
                  "rounded-lg p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                  style.id === "faithful" && "col-span-2",
                  value.style === style.id
                    ? "bg-foreground/[0.08]"
                    : "bg-muted/30 hover:bg-muted/70",
                )}
              >
                <span className="block text-xs font-semibold">{style.label}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  {style.description}
                </span>
              </button>
            ))}
          </div>
          <label className="block text-xs text-muted-foreground">
            Realism treatment
            <select
              className="mt-1.5 h-9 w-full rounded-md border-0 bg-muted/50 px-2 text-xs"
              value={value.realism ?? "off"}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  realism: event.target.value as NonNullable<ImageCreativeDirection["realism"]>,
                })
              }
            >
              <option value="off">From style and prompt</option>
              <option value="natural">Natural camera Ã‚Â· subtle texture</option>
              <option value="editorial">Editorial camera Ã‚Â· controlled detail</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">
              Lighting
              <select
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={value.lighting}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    lighting: event.target.value as ImageCreativeDirection["lighting"],
                  })
                }
              >
                <option value="auto">From prompt</option>
                <option value="daylight">Soft daylight</option>
                <option value="studio">Studio softbox</option>
                <option value="golden-hour">Golden hour</option>
                <option value="dramatic">Dramatic</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Composition
              <select
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={value.composition}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    composition: event.target.value as ImageCreativeDirection["composition"],
                  })
                }
              >
                <option value="auto">From prompt</option>
                <option value="portrait">Portrait</option>
                <option value="wide">Establishing shot</option>
                <option value="close-up">Close-up detail</option>
                <option value="copy-space">Space for copy</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Detail treatment
              <select
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={value.detail}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    detail: event.target.value as ImageCreativeDirection["detail"],
                  })
                }
              >
                <option value="natural">Natural</option>
                <option value="crisp">Crisp focal detail</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Reference intent
              <select
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={value.referenceRole}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    referenceRole: event.target.value as ImageCreativeDirection["referenceRole"],
                  })
                }
              >
                <option value="auto">From prompt</option>
                <option value="subject">Subject identity</option>
                <option value="style">Visual style</option>
                <option value="composition">Composition</option>
              </select>
            </label>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Direction guides the prompt. Resolution and rendering quality are set separately below.
            Reference intent applies when images are attached to a supported model.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          ZImage's baseline image guidance still applies. Your requested style takes precedence.
        </p>
      )}
      <details className="rounded-lg bg-muted/50 p-3">
        <summary className="cursor-pointer text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Preview model prompt
        </summary>
        <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
          {preview || "Write a prompt to preview the instructions sent to the model."}
        </p>
      </details>
    </section>
  );
}
