import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useFlowSheets } from "./useFlowSheets";
import { Button } from "../ui/button";
import { useSidebar } from "../ui/sidebar";

export function CanvasSheetNavigation({ environmentId }: { readonly environmentId: string }) {
  const { state, session } = useFlowSheets(environmentId);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const disabled = !state.ready || state.transitioning || state.generating;
  const open = async (id?: string) => {
    const success = id ? await session.select(id) : await session.create();
    if (!success) return;
    if (!id) {
      setSearch("");
      setLimit(20);
    }
    await navigate({ to: "/" });
    setOpenMobile(false);
  };
  const matches = state.sheets.filter((sheet) =>
    sheet.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <section aria-label="Saved canvases" className="mb-5">
      <Button
        className="mb-5 w-full justify-start gap-2"
        disabled={disabled}
        onClick={() => void open()}
        title={
          state.generating
            ? "Finish or stop the current run before opening another canvas"
            : "Save this sheet and start a blank canvas"
        }
      >
        <span aria-hidden="true">+</span>
        {state.transitioning ? "Saving canvasâ€¦" : "New generation"}
      </Button>
      <div className="mb-2 flex items-center justify-between px-2">
        <h2 className="text-xs font-medium text-muted-foreground">Canvases</h2>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {state.sheets.length}
        </span>
      </div>
      {state.sheets.length > 5 && (
        <input
          aria-label="Search canvases"
          type="search"
          placeholder="Find a canvasâ€¦"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(20);
          }}
          className="mb-2 w-full rounded-md border-0 bg-sidebar-accent/40 px-2.5 py-2 text-xs outline-offset-2"
        />
      )}
      <nav aria-label="Canvas sheets" className="space-y-1">
        {matches.slice(0, limit).map((sheet) => {
          const active = sheet.id === state.activeId && !state.libraryOpen;
          return (
            <div key={sheet.id} className="flex items-center gap-1">
              <button
                type="button"
                disabled={disabled}
                aria-current={active ? "page" : undefined}
                title={sheet.title || "Untitled canvas"}
                onClick={() => void open(sheet.id)}
                className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left outline-offset-2 disabled:cursor-wait ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50"}`}
              >
                <span aria-hidden="true" className="mt-0.5 text-sm text-muted-foreground">
                  â–§
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {sheet.title.trim() || "Untitled canvas"}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {sheet.nodeCount === 0
                      ? "Blank canvas"
                      : `${sheet.nodeCount} card${sheet.nodeCount === 1 ? "" : "s"}`}{" "}
                    Â·{" "}
                    <time dateTime={new Date(sheet.updatedAt).toISOString()}>
                      {new Date(sheet.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Delete ${sheet.title || "Untitled canvas"}`}
                title="Delete canvas"
                className="rounded-md px-2 py-2 text-muted-foreground hover:bg-sidebar-accent hover:text-destructive disabled:opacity-40"
                onClick={() => setDeleting(sheet.id)}
              >
                ×
              </button>
            </div>
          );
        })}
      </nav>
      {deleting && (
        <div role="alert" className="mt-3 rounded-md bg-sidebar-accent/50 p-3 text-xs">
          <p className="font-medium">
            Delete “
            {state.sheets.find((sheet) => sheet.id === deleting)?.title || "Untitled canvas"}”?
          </p>
          <p className="mt-2 text-muted-foreground">
            This removes the canvas and its uploaded references permanently. Generated images and
            videos stay in your library.
          </p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={disabled}
              className="text-destructive"
              onClick={() =>
                void session.remove(deleting).then((success) => {
                  if (success) setDeleting(null);
                })
              }
            >
              Delete canvas
            </button>
            <button type="button" disabled={state.transitioning} onClick={() => setDeleting(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {!state.ready && !state.error && (
        <p role="status" className="px-2 py-3 text-xs text-muted-foreground">
          Loading canvasesâ€¦
        </p>
      )}
      {state.ready && !matches.length && (
        <p className="px-2 py-3 text-xs text-muted-foreground">No canvases match your search.</p>
      )}
      {matches.length > limit && (
        <button
          type="button"
          className="mt-2 px-2 text-xs text-muted-foreground"
          onClick={() => setLimit((value) => value + 20)}
        >
          Show more canvases
        </button>
      )}
      {state.error && (
        <div role="alert" className="mt-3 px-2 text-xs text-destructive">
          <p>{state.error}</p>
          {!state.ready && (
            <button
              type="button"
              className="mt-2 underline"
              onClick={() => void session.initialize()}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </section>
  );
}
