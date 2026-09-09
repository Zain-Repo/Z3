import type { ChatProjectSource } from "../../lib/chatProjects";

const PREVIEW_CHARACTER_LIMIT = 12_000;

/** Render bounded plain text so uploaded content cannot execute markup or overwhelm the panel. */
export function ChatSourcePreview({ source }: { readonly source: ChatProjectSource }) {
  const status =
    source.indexStatus === "completed"
      ? "Indexed"
      : source.indexStatus === "in_progress"
        ? "Indexing"
        : source.indexStatus === "failed"
          ? "Index failed"
          : "Index status unavailable";

  return (
    <details className="px-2 pb-3 text-xs">
      <summary className="cursor-pointer rounded-sm py-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        Preview source · {status}
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-sans text-xs leading-relaxed text-foreground">
        {source.contents
          ? source.contents.slice(0, PREVIEW_CHARACTER_LIMIT)
          : "Text preview is not available for this source."}
      </pre>
      {source.contents.length > PREVIEW_CHARACTER_LIMIT ? (
        <p className="mt-2 text-muted-foreground">Showing the first 12,000 characters.</p>
      ) : null}
    </details>
  );
}
