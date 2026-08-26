import type { ReactNode } from "react";

interface ComposerFileDropZoneProps {
  readonly active: boolean;
  readonly children: ReactNode;
}

/**
 * Provides a visible, non-intercepting drop target for files over the chat
 * composer. The parent owns the native drag events so file-tree mentions can
 * continue to use their existing capture-phase behavior.
 */
export function ComposerFileDropZone({ active, children }: ComposerFileDropZoneProps) {
  return (
    <div className="relative">
      {children}
      {active ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[15px] border-2 border-dashed border-primary bg-background/80 px-6 text-center text-sm font-medium text-foreground shadow-lg"
          role="status"
          aria-live="polite"
        >
          Drop any file to attach it
        </div>
      ) : null}
    </div>
  );
}
