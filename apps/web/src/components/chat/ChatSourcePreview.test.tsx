import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { ChatProjectSource } from "../../lib/chatProjects";
import { ChatSourcePreview } from "./ChatSourcePreview";

const source: ChatProjectSource = {
  id: "source-1",
  name: "reference.txt",
  mimeType: "text/plain",
  sizeBytes: 100,
  contents: "Project reference",
  createdAt: "2026-09-09T12:00:00Z",
};

describe("ChatSourcePreview", () => {
  it("renders uploaded markup as plain text", () => {
    const markup = renderToStaticMarkup(
      <ChatSourcePreview source={{ ...source, contents: '<script>alert("unsafe")</script>' }} />,
    );
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>");
  });

  it("bounds long previews and explains the truncation", () => {
    const markup = renderToStaticMarkup(
      <ChatSourcePreview source={{ ...source, contents: "x".repeat(12_000) + "excluded tail" }} />,
    );
    expect(markup).toContain("Showing the first 12,000 characters.");
    expect(markup).not.toContain("excluded tail");
  });

  it("shows an explicit empty preview for binary sources without extracted text", () => {
    const markup = renderToStaticMarkup(<ChatSourcePreview source={{ ...source, contents: "" }} />);
    expect(markup).toContain("Text preview is not available for this source.");
    expect(markup).not.toContain("Showing the first");
  });

  it.each([
    ["completed", "Indexed"],
    ["in_progress", "Indexing"],
    ["failed", "Index failed"],
  ] as const)("labels the %s index state", (indexStatus, label) => {
    const markup = renderToStaticMarkup(<ChatSourcePreview source={{ ...source, indexStatus }} />);
    expect(markup).toContain(label);
  });
});
