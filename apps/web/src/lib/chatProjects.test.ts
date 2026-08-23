import { describe, expect, it } from "vite-plus/test";

import {
  buildChatProjectContext,
  isSupportedChatProjectSource,
  projectForChatThread,
  type ChatProject,
} from "./chatProjects";

const project: ChatProject = {
  id: "project-1",
  name: "Launch plan",
  instructions: "Prefer concise launch checklists.",
  sources: [
    {
      id: "source-1",
      name: "brief.md",
      mimeType: "text/markdown",
      sizeBytes: 12,
      contents: "The launch is scheduled for October.",
      createdAt: "2026-08-23T00:00:00.000Z",
    },
  ],
  threadIds: ["thread-1"],
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
};

describe("chat projects", () => {
  it("builds a bounded prompt context from instructions and sources", () => {
    const context = buildChatProjectContext(project);

    expect(context).toContain("Launch plan");
    expect(context).toContain("Prefer concise launch checklists.");
    expect(context).toContain('source name="brief.md"');
    expect(context).toContain("October");
  });

  it("resolves a project by its chat membership", () => {
    expect(projectForChatThread([project], "thread-1")).toBe(project);
    expect(projectForChatThread([project], "thread-2")).toBeNull();
  });

  it("accepts text and code sources and rejects oversized or binary files", () => {
    expect(isSupportedChatProjectSource({ name: "notes.txt", type: "text/plain", size: 20 })).toBe(
      true,
    );
    expect(isSupportedChatProjectSource({ name: "app.tsx", type: "", size: 20 })).toBe(true);
    expect(
      isSupportedChatProjectSource({ name: "archive.zip", type: "application/zip", size: 20 }),
    ).toBe(false);
  });
});
