import {
  fetchChatLibrary,
  removeChatLibraryFile,
} from "@t3tools/client-runtime/state/chat-library";
import type { ChatLibraryItem, EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownToLineIcon,
  ArrowUpRightIcon,
  FileIcon,
  ImageIcon,
  LayoutGridIcon,
  LibraryIcon,
  ListIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useAssetUrlState } from "../assets/assetUrls";
import { isElectron } from "../env";
import { runtime } from "../lib/runtime";
import { cn } from "../lib/utils";
import { useActiveEnvironmentId } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { usePreparedConnection } from "../state/session";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";
import { Button } from "./ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPopup, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { LibraryUploadDropzone } from "./library/LibraryUploadDropzone";

const PAGE_SIZE = 48;
const FILTERS = [
  { value: "all", label: "All files", icon: LibraryIcon },
  { value: "images", label: "Images", icon: ImageIcon },
  { value: "files", label: "Documents & other", icon: FileIcon },
] as const;
type Category = (typeof FILTERS)[number]["value"];

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function ChatLibraryPage() {
  const { environments } = useEnvironments();
  const activeId = useActiveEnvironmentId();
  const primaryId = usePrimaryEnvironmentId();
  const [selectedId, setSelectedId] = useState<EnvironmentId | null>(null);
  const environmentId =
    environments.find((entry) => entry.environmentId === selectedId)?.environmentId ??
    environments.find((entry) => entry.environmentId === activeId)?.environmentId ??
    primaryId ??
    environments[0]?.environmentId ??
    null;

  return (
    <SidebarInset className="min-h-0 overflow-hidden">
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-2 border-b border-border/60 bg-primary/[0.08] px-4",
          COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          isElectron && "drag-region",
        )}
      >
        <SidebarTrigger className="no-drag md:hidden" />
        <LibraryIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Library</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Your library</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Files and images you’ve shared in Z3Chat, all in one place.
              </p>
            </div>
            {environments.length > 1 ? (
              <select
                aria-label="Library environment"
                value={environmentId ?? ""}
                onChange={(event) => {
                  const entry = environments.find(
                    (item) => item.environmentId === event.target.value,
                  );
                  if (entry) setSelectedId(entry.environmentId);
                }}
                className="h-9 max-w-60 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {environments.map((entry) => (
                  <option key={entry.environmentId} value={entry.environmentId}>
                    {entry.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {environmentId ? (
            <EnvironmentLibrary key={environmentId} environmentId={environmentId} />
          ) : (
            <LibraryEmpty
              title="Connect to see your files"
              description="Your library will appear when an environment is connected."
            />
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

function EnvironmentLibrary({ environmentId }: { environmentId: EnvironmentId }) {
  const prepared = usePreparedConnection(environmentId);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<ReadonlyArray<ChatLibraryItem>>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<ChatLibraryItem | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (prepared._tag === "None") return;
    const controller = new AbortController();
    setStatus("loading");
    void runtime
      .runPromise(fetchChatLibrary(prepared.value, { offset, limit: PAGE_SIZE, query, category }), {
        signal: controller.signal,
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        setNextOffset(result.nextOffset);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [prepared, offset, query, category, revision]);

  const waiting = status === "loading" || search.trim() !== query;
  return (
    <>
      {prepared._tag === "Some" ? (
        <LibraryUploadDropzone
          key={environmentId}
          prepared={prepared.value}
          onUploaded={() => {
            setSearch("");
            setQuery("");
            setCategory("all");
            setOffset(0);
            setRevision((value) => value + 1);
          }}
        />
      ) : null}
      <div className="mb-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative max-w-lg flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search files by name"
              placeholder="Search your files…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 ps-9"
              type="search"
              maxLength={200}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh library"
            disabled={waiting}
            onClick={() => {
              setOffset(0);
              setRevision((value) => value + 1);
            }}
          >
            <RefreshCwIcon />
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1" role="group" aria-label="File type">
            {FILTERS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                size="sm"
                variant={category === value ? "secondary" : "ghost"}
                aria-pressed={category === value}
                onClick={() => {
                  setCategory(value);
                  setOffset(0);
                }}
              >
                <Icon aria-hidden="true" />
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Newest first</span>
            <div
              className="flex rounded-md border border-border p-0.5"
              role="group"
              aria-label="Library view"
            >
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <LayoutGridIcon />
              </Button>
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <ListIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
      {prepared._tag === "None" ? (
        <LibraryEmpty
          title="Environment disconnected"
          description="Reconnect to browse the files saved in this environment."
        />
      ) : status === "error" ? (
        <div role="alert" className="rounded-xl border border-border p-8 text-center">
          <p className="font-medium">Couldn’t load your library</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Check your connection and make sure this environment is running the latest Z3 server.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      ) : waiting ? (
        <div role="status" className="py-20 text-center text-sm text-muted-foreground">
          Loading your files…
        </div>
      ) : items.length === 0 ? (
        <LibraryEmpty
          title={query || category !== "all" ? "No matching files" : "Your library is empty"}
          description={
            query || category !== "all"
              ? "Try another name or choose a different file type."
              : "Drop files above, or upload them in a conversation. They’ll be here whenever you need them."
          }
        >
          {query || category !== "all" ? (
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setQuery("");
                setCategory("all");
                setOffset(0);
              }}
            >
              Clear filters
            </Button>
          ) : (
            <Button variant="outline" render={<Link to="/new" />}>
              Start a conversation
              <ArrowUpRightIcon />
            </Button>
          )}
        </LibraryEmpty>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground" role="status">
            {offset === 0 ? "Recent uploads" : "Earlier uploads"} · {items.length}{" "}
            {items.length === 1 ? "file" : "files"}
          </p>
          <div
            className={
              view === "grid"
                ? "grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4"
                : "divide-y divide-border rounded-xl border border-border"
            }
          >
            {items.map((item) => (
              <button
                key={`${item.messageId}:${item.attachment.id}`}
                type="button"
                onClick={() => setSelected(item)}
                className={cn(
                  "group min-w-0 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === "grid"
                    ? "overflow-hidden rounded-xl border border-border/70 bg-card transition-colors hover:bg-accent/40"
                    : "flex w-full items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40",
                )}
              >
                <FileThumbnail
                  item={item}
                  environmentId={environmentId}
                  compact={view === "list"}
                />
                <div className={cn("min-w-0 flex-1", view === "grid" && "p-3")}>
                  <p className="truncate text-sm font-medium" title={item.attachment.name}>
                    {item.attachment.name}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {fileSize(item.attachment.sizeBytes)} ·{" "}
                    {dateFormatter.format(new Date(item.createdAt))}
                  </p>
                  {view === "grid" ? (
                    <p className="mt-2 truncate text-xs text-muted-foreground/80">
                      {item.threadTitle ?? "Uploaded to library"}
                    </p>
                  ) : null}
                </div>
                {view === "list" ? (
                  <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:block">
                    {item.threadTitle ?? "Uploaded to library"}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      )}
      {!waiting &&
      prepared._tag === "Some" &&
      status === "ready" &&
      (offset > 0 || nextOffset !== null) ? (
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {Math.floor(offset / PAGE_SIZE) + 1}
          </span>
          <Button
            variant="outline"
            disabled={nextOffset === null}
            onClick={() => {
              if (nextOffset !== null) setOffset(nextOffset);
            }}
          >
            Next
          </Button>
        </div>
      ) : null}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected ? (
          <LibraryFileDetails
            key={`${selected.messageId}:${selected.attachment.id}`}
            item={selected}
            environmentId={environmentId}
            onRemoved={() => {
              setSelected(null);
              setRevision((value) => value + 1);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function LibraryEmpty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <LibraryIcon
        aria-hidden="true"
        className="mb-5 size-8 text-muted-foreground/60"
        strokeWidth={1.5}
      />
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

function FileThumbnail({
  item,
  environmentId,
  compact = false,
}: {
  item: ChatLibraryItem;
  environmentId: EnvironmentId;
  compact?: boolean;
}) {
  const image = item.attachment.type === "image";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-muted/50",
        compact ? "size-11 rounded-md" : "aspect-[4/3] border-b border-border/50",
      )}
    >
      {image ? (
        <LibraryImage item={item} environmentId={environmentId} />
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <FileIcon
            aria-hidden="true"
            className={compact ? "size-5" : "size-10"}
            strokeWidth={1.5}
          />
          {!compact ? (
            <span className="max-w-32 truncate text-[10px] font-medium uppercase tracking-wider">
              {item.attachment.name.split(".").pop() || "File"}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function LibraryImage({
  item,
  environmentId,
}: {
  item: ChatLibraryItem;
  environmentId: EnvironmentId;
}) {
  const asset = useAssetUrlState(environmentId, {
    _tag: "attachment",
    attachmentId: item.attachment.id,
  });
  const [failed, setFailed] = useState(false);
  if (asset._tag !== "Success" || failed)
    return (
      <ImageIcon
        aria-label={failed || asset._tag === "Failure" ? "Preview unavailable" : "Loading preview"}
        className="size-7 text-muted-foreground/50"
      />
    );
  return (
    <img
      src={asset.url}
      alt={item.attachment.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-contain outline -outline-offset-1 outline-black/10 dark:outline-white/10"
    />
  );
}

function LibraryFileDetails({
  item,
  environmentId,
  onRemoved,
}: {
  item: ChatLibraryItem;
  environmentId: EnvironmentId;
  onRemoved: () => void;
}) {
  const prepared = usePreparedConnection(environmentId);
  const asset = useAssetUrlState(environmentId, {
    _tag: "attachment",
    attachmentId: item.attachment.id,
  });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  async function remove() {
    if (prepared._tag === "None") return;
    setRemoving(true);
    setRemoveError(false);
    try {
      await runtime.runPromise(removeChatLibraryFile(prepared.value, item.attachment.id));
      onRemoved();
    } catch {
      setRemoveError(true);
    } finally {
      setRemoving(false);
    }
  }
  async function download() {
    if (asset._tag !== "Success") return;
    setDownloading(true);
    setError(false);
    try {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error("Download failed");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = item.attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Keep the object URL alive until the browser has started the download.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(true);
    } finally {
      setDownloading(false);
    }
  }
  return (
    <DialogPopup className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="break-all pe-6 text-lg">{item.attachment.name}</DialogTitle>
        <DialogDescription>
          {fileSize(item.attachment.sizeBytes)} · Uploaded{" "}
          {dateFormatter.format(new Date(item.createdAt))}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-5 px-6 pb-6">
        {item.attachment.type === "image" ? (
          <div className="flex h-72 items-center justify-center overflow-hidden rounded-lg bg-muted/50">
            <LibraryImage item={item} environmentId={environmentId} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/50 p-10">
            <FileIcon className="size-12 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">
              Download this file to view its contents.
            </p>
          </div>
        )}
        <div className="text-sm">
          <p className="text-xs text-muted-foreground">Source</p>
          <p className="mt-1 break-words font-medium">
            {item.threadTitle ?? "Uploaded to library"}
          </p>
        </div>
        {error || asset._tag === "Failure" ? (
          <p role="alert" className="text-sm text-destructive">
            This file couldn’t be downloaded. It may no longer be available. Try again after
            reconnecting.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={downloading || asset._tag !== "Success"}
            onClick={() => void download()}
          >
            <ArrowDownToLineIcon />
            {downloading ? "Downloading…" : "Download"}
          </Button>
          {item.threadId !== null ? (
            <Button
              variant="outline"
              render={
                <Link
                  to="/$environmentId/$threadId"
                  params={{ environmentId, threadId: item.threadId }}
                />
              }
            >
              Open conversation
              <ArrowUpRightIcon />
            </Button>
          ) : null}
          {item.threadId === null && !confirmRemove ? (
            <Button
              variant="ghost"
              className="ms-auto"
              aria-label="Remove file from library"
              disabled={prepared._tag === "None"}
              onClick={() => setConfirmRemove(true)}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>
        {confirmRemove ? (
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Remove this file from your library?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The uploaded copy will be deleted. Your original file stays on your device.
            </p>
            {removeError ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                Couldn’t remove this file. Check your connection and try again.
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button
                variant="destructive"
                disabled={removing || prepared._tag === "None"}
                onClick={() => void remove()}
              >
                {removing ? "Removing…" : "Remove file"}
              </Button>
              <Button variant="outline" disabled={removing} onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </DialogPopup>
  );
}
