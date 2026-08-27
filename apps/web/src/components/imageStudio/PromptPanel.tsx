import { DicesIcon, HistoryIcon, SparklesIcon, Trash2Icon } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Textarea } from "../ui/textarea";

function isMacLike(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
}

export function PromptPanel({
  prompt,
  onChange,
  onSurprise,
  history,
  onRestorePrompt,
  onClearHistory,
  disabled,
}: {
  readonly prompt: string;
  readonly onChange: (prompt: string) => void;
  readonly onSurprise: () => void;
  readonly history: ReadonlyArray<string>;
  readonly onRestorePrompt: (prompt: string) => void;
  readonly onClearHistory: () => void;
  readonly disabled: boolean;
}) {
  const characterCount = prompt.length;

  return (
    <section className="rounded-xl border border-border/70 bg-card/40 p-4 shadow-sm/5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="zimage-prompt" className="text-sm font-medium">
          Prompt
        </label>
        <span className="text-[11px] tabular-nums text-muted-foreground/70">
          {characterCount} chars
        </span>
      </div>
      <Textarea
        id="zimage-prompt"
        value={prompt}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Describe the image you want to create..."
        className="mt-2 min-h-32 max-h-64 resize-y bg-background/70 [&>textarea]:max-h-64 [&>textarea]:resize-y [&>textarea]:overflow-y-auto [&>textarea]:scrollbar-gutter-stable"
        disabled={disabled}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={onSurprise}
          disabled={disabled}
        >
          <DicesIcon className="size-3.5" aria-hidden="true" />
          Surprise me
        </Button>
        {history.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/75">
            <HistoryIcon className="size-3.5" aria-hidden="true" />
            {history.length} recent
          </span>
        ) : null}
        <div className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground/70 sm:flex">
          <span>Generate</span>
          <KbdGroup>
            <Kbd>{isMacLike() ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>Enter</Kbd>
          </KbdGroup>
        </div>
      </div>

      {history.length > 0 ? (
        <div className="mt-3 border-t border-border/60 pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              Recent prompts
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Clear prompt history"
              title="Clear prompt history"
              className="text-muted-foreground hover:text-destructive"
              onClick={onClearHistory}
            >
              <Trash2Icon className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {history.slice(0, 5).map((entry) => (
              <li key={entry}>
                <button
                  type="button"
                  onClick={() => onRestorePrompt(entry)}
                  className={cn(
                    "w-full truncate rounded-md px-2 py-1 text-left text-xs text-muted-foreground",
                    "transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  )}
                  title={entry}
                >
                  <SparklesIcon
                    className="mr-1.5 inline size-3 text-fuchsia-500/70"
                    aria-hidden="true"
                  />
                  {entry}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
