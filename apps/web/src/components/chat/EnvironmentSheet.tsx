import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  CircleDotIcon,
  GitBranchIcon,
  GitCompareArrowsIcon,
  LaptopIcon,
  ListPlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { VcsStatusResult } from "@t3tools/contracts";
import type { ReactNode } from "react";

import { Button } from "../ui/button";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "../ui/sheet";
import { cn } from "~/lib/utils";

interface EnvironmentSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly gitStatus: VcsStatusResult | null;
  readonly onOpenChanges: () => void;
  readonly onCommitOrPush: () => void;
  readonly onCompareBranch: () => void;
}

function SheetRow({
  icon,
  label,
  end,
  onClick,
  disabled = false,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly end?: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className="h-10 w-full justify-start rounded-lg px-1.5 text-sm font-normal hover:bg-accent/60"
    >
      <span className="flex size-7 items-center justify-center text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {end ? <span className="ml-auto flex shrink-0 items-center gap-2">{end}</span> : null}
    </Button>
  );
}

export function EnvironmentSheet({
  open,
  onOpenChange,
  gitStatus,
  onOpenChanges,
  onCommitOrPush,
  onCompareBranch,
}: EnvironmentSheetProps) {
  const additions = gitStatus?.workingTree.insertions ?? 0;
  const deletions = gitStatus?.workingTree.deletions ?? 0;
  const hasChanges = gitStatus?.hasWorkingTreeChanges ?? false;
  const branchLabel = gitStatus?.refName ?? "Detached HEAD";
  const compareDisabled = !gitStatus?.isRepo || gitStatus?.refName === null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup
        side="right"
        showCloseButton
        className="w-[min(100vw-3rem,24rem)] max-w-none bg-background/98 shadow-2xl"
      >
        <SheetHeader className="border-b border-border/70 px-5 pb-4 pt-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontalIcon className="size-4 text-muted-foreground" />
            <SheetTitle className="text-base">Environment</SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            Git status and source control actions for the active workspace.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="px-4 py-4">
          <div className="space-y-1">
            <SheetRow
              icon={<ListPlusIcon className="size-4" />}
              label="Changes"
              disabled={!gitStatus?.isRepo}
              onClick={onOpenChanges}
              end={
                <span className="flex items-center gap-1 tabular-nums text-xs">
                  <span
                    className={cn(
                      additions > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                    )}
                  >
                    +{additions.toLocaleString()}
                  </span>
                  <span
                    className={cn(
                      deletions > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                    )}
                  >
                    -{deletions.toLocaleString()}
                  </span>
                </span>
              }
            />
            <SheetRow
              icon={<LaptopIcon className="size-4" />}
              label="Local"
              disabled={!gitStatus?.isRepo}
              end={<ChevronDownIcon className="size-4 text-muted-foreground" />}
            />
            <SheetRow
              icon={<GitBranchIcon className="size-4" />}
              label={branchLabel}
              disabled={!gitStatus?.isRepo}
              end={<ChevronDownIcon className="size-4 text-muted-foreground" />}
            />
            <SheetRow
              icon={<CircleDotIcon className="size-4" />}
              label={hasChanges ? "Commit or push" : "Push changes"}
              disabled={!gitStatus?.isRepo}
              onClick={onCommitOrPush}
            />
            <SheetRow
              icon={<GitCompareArrowsIcon className="size-4" />}
              label="Compare branch"
              disabled={compareDisabled}
              onClick={onCompareBranch}
              end={<ArrowUpRightIcon className="size-4 text-muted-foreground" />}
            />
          </div>
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}
