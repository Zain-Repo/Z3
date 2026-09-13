import { cn } from "~/lib/utils";

/** Compact product signature shared by workspace chrome and onboarding. */
export function Z3Mark({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-sm font-semibold tracking-[-0.12em] text-primary-foreground",
        className,
      )}
    >
      Z3
    </span>
  );
}
