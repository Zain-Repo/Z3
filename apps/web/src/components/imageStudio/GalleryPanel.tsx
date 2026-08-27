import { ImageIcon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { ImageGenerationInput, ImageGenerationRecord } from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { GenerationCard, PendingGenerationCard } from "../ImageGenerationGallery";
import type { LoadImageContent } from "../imageContentLoader";
import { STARTER_PROMPTS } from "../../lib/imageStudioPrefs";

type SortOrder = "newest" | "oldest";

function filterGenerations(
  generations: ReadonlyArray<ImageGenerationRecord>,
  search: string,
  model: string,
  sort: SortOrder,
): ReadonlyArray<ImageGenerationRecord> {
  const normalized = search.trim().toLowerCase();
  const filtered = generations.filter((generation) => {
    if (model !== "" && generation.model !== model) return false;
    if (normalized.length === 0) return true;
    return (
      generation.prompt.toLowerCase().includes(normalized) ||
      (generation.assets[0]?.revisedPrompt ?? "").toLowerCase().includes(normalized)
    );
  });
  return [...filtered].sort((a, b) =>
    sort === "newest"
      ? b.createdAt.localeCompare(a.createdAt)
      : a.createdAt.localeCompare(b.createdAt),
  );
}

export function GalleryPanel({
  generations,
  visibleCount,
  isLoading,
  isGenerating,
  pendingInput,
  loadImageContent,
  onDelete,
  onReuse,
  onReroll,
  onCancel,
  onLoadMore,
  canLoadMore,
  onUseStarter,
  className,
}: {
  readonly generations: ReadonlyArray<ImageGenerationRecord>;
  readonly visibleCount: number;
  readonly isLoading: boolean;
  readonly isGenerating: boolean;
  readonly pendingInput: ImageGenerationInput | null;
  readonly loadImageContent: LoadImageContent;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onReuse: (input: ImageGenerationInput) => void;
  readonly onReroll: (input: ImageGenerationInput) => void;
  readonly onCancel: () => void;
  readonly onLoadMore: () => void;
  readonly canLoadMore: boolean;
  readonly onUseStarter: (prompt: string) => void;
  readonly className?: string;
}) {
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [sort, setSort] = useState<SortOrder>("newest");

  const modelOptions = useMemo(
    () => Array.from(new Set(generations.map((generation) => generation.model))).sort(),
    [generations],
  );

  const visibleGenerations = useMemo(
    () => filterGenerations(generations, search, modelFilter, sort),
    [generations, search, modelFilter, sort],
  ).slice(0, visibleCount);

  const hasFilters = search.trim().length > 0 || modelFilter !== "";
  const showEmptyState = !isLoading && !isGenerating && generations.length === 0;

  return (
    <section className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your generations by prompt..."
            aria-label="Search generations"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {modelOptions.length > 1 ? (
          <select
            value={modelFilter}
            onChange={(event) => setModelFilter(event.target.value)}
            aria-label="Filter by model"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">All models</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        ) : null}
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortOrder)}
          aria-label="Sort generations"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Your generations</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{generations.length}</span>
      </div>

      {showEmptyState ? (
        <Empty className="rounded-xl border border-dashed border-border/70 bg-card/20">
          <EmptyMedia variant="icon">
            <ImageIcon className="size-4.5" aria-hidden="true" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No generations yet</EmptyTitle>
            <EmptyDescription>
              Your generated images will appear here. Try one of these starters or write your own
              prompt.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex w-full flex-col gap-1.5">
              {STARTER_PROMPTS.slice(0, 3).map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => onUseStarter(starter)}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-left text-xs leading-relaxed text-muted-foreground",
                    "transition-colors hover:border-fuchsia-500/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  )}
                >
                  <SparklesIcon
                    className="mt-0.5 size-3.5 shrink-0 text-fuchsia-500/70"
                    aria-hidden="true"
                  />
                  <span className="line-clamp-2">{starter}</span>
                </button>
              ))}
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="mt-4 grid grid-cols-2 items-start gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {isGenerating && pendingInput ? (
            <PendingGenerationCard input={pendingInput} onCancel={onCancel} />
          ) : null}
          {visibleGenerations.map((generation) => (
            <GenerationCard
              key={generation.id}
              generation={generation}
              loadImageContent={loadImageContent}
              onDelete={onDelete}
              onReuse={onReuse}
              onReroll={onReroll}
            />
          ))}
        </div>
      )}

      {!showEmptyState && hasFilters && visibleGenerations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-y border-border/60 py-12 text-center">
          <p className="text-sm font-medium">No matching generations</p>
          <p className="text-xs text-muted-foreground">
            Try a different search or clear the filters.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-1"
            onClick={() => {
              setSearch("");
              setModelFilter("");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : null}

      {!showEmptyState && canLoadMore ? (
        <div className="mt-5 flex justify-center py-2">
          <Button variant="ghost" size="sm" onClick={onLoadMore}>
            Load more generations
          </Button>
        </div>
      ) : null}
    </section>
  );
}
