import { describe, expect, it } from "vite-plus/test";
import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS } from "@t3tools/contracts";

import {
  buildChatProjectContext,
  buildChatProjectPrompt,
  CHAT_PROJECT_SOURCE_MAX_BYTES,
  isSupportedChatProjectSource,
  type ChatProjectMemoryMode,
  projectForChatThread,
  type ChatProject,
} from "./chatProjects";

const project: ChatProject = {
  id: "project-1",
  name: "Launch plan",
  isPinned: false,
  memoryMode: "project-only",
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
  it("supports full-memory and project-only modes", () => {
    const modes: ChatProjectMemoryMode[] = ["full", "project-only"];
    expect(modes).toEqual(["full", "project-only"]);
  });

  it("builds a bounded prompt context from instructions and sources", () => {
    const context = buildChatProjectContext(project);

    expect(context).toContain("Launch plan");
    expect(context).toContain("Prefer concise launch checklists.");
    expect(context).toContain('"name":"brief.md"');
    expect(context).toContain("project-source-catalog");
    expect(context).toContain("October");
  });

  it("keeps the complete project prompt within the provider input limit", () => {
    const oversizedProject: ChatProject = {
      ...project,
      sources: [
        {
          ...project.sources[0]!,
          contents: "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS),
        },
      ],
    };

    const prompt = buildChatProjectPrompt(oversizedProject, "Summarize the project.");

    expect(prompt.length).toBeLessThanOrEqual(PROVIDER_SEND_TURN_MAX_INPUT_CHARS);
    expect(prompt).toContain("Summarize the project.");
    expect(prompt).toContain("Additional project context omitted");
  });

  it("resolves a project by its chat membership", () => {
    expect(projectForChatThread([project], "thread-1")).toBe(project);
    expect(projectForChatThread([project], "thread-2")).toBeNull();
  });

  it("accepts any file type within the source size limit", () => {
    expect(isSupportedChatProjectSource({ name: "notes.txt", type: "text/plain", size: 20 })).toBe(
      true,
    );
    expect(isSupportedChatProjectSource({ name: "app.tsx", type: "", size: 20 })).toBe(true);
    expect(
      isSupportedChatProjectSource({ name: "archive.zip", type: "application/zip", size: 20 }),
    ).toBe(true);
    expect(
      isSupportedChatProjectSource({
        name: "large-video.mp4",
        type: "video/mp4",
        size: CHAT_PROJECT_SOURCE_MAX_BYTES + 1,
      }),
    ).toBe(false);
  });
});
