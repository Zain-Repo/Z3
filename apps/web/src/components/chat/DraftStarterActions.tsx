import { BugIcon, GitPullRequestIcon, MapIcon } from "lucide-react";
import { Button } from "../ui/button";

const STARTERS = [
  {
    label: "Plan a change",
    icon: MapIcon,
    prompt:
      "Help me plan a change in this project. First ask what I want to build, then inspect the relevant code and propose a focused implementation plan.",
  },
  {
    label: "Investigate a bug",
    icon: BugIcon,
    prompt:
      "Help me investigate a bug. Ask me for the symptoms and reproduction steps, then trace the relevant code before suggesting a fix.",
  },
  {
    label: "Review changes",
    icon: GitPullRequestIcon,
    prompt:
      "Review the current uncommitted changes for bugs, regressions, and missing validation. Explain actionable findings with file references. Do not edit files.",
  },
] as const;

export function DraftStarterActions({
  onSelect,
  disabled,
}: {
  readonly onSelect: (prompt: string) => void;
  readonly disabled: boolean;
}) {
  return (
    <section
      aria-label="Prompt starters"
      className="pointer-events-auto mx-auto mt-5 w-full max-w-3xl"
    >
      <div className="flex flex-wrap justify-center gap-2">
        {STARTERS.map(({ label, icon: Icon, prompt }) => (
          <Button
            key={label}
            variant="outline"
            size="sm"
            disabled={disabled}
            className="rounded-lg bg-card/60 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onSelect(prompt)}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Add a starting point, then make it yours.
      </p>
    </section>
  );
}
