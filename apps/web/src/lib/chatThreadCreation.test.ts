import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  findDuplicateEmptyChatThreadIds,
  resolveChatEnvironmentId,
} from "./chatThreadCreation";

const primaryEnvironmentId = EnvironmentId.make("environment-primary");
const secondaryEnvironmentId = EnvironmentId.make("environment-secondary");

describe("resolveChatEnvironmentId", () => {
  it("uses a valid persisted selection before active environment state", () => {
    expect(
      resolveChatEnvironmentId(secondaryEnvironmentId, primaryEnvironmentId, primaryEnvironmentId, [
        primaryEnvironmentId,
        secondaryEnvironmentId,
      ]),
    ).toBe(secondaryEnvironmentId);
  });

  it("falls back when persisted selection is no longer available", () => {
    expect(
      resolveChatEnvironmentId(
        "environment-removed",
        primaryEnvironmentId,
        secondaryEnvironmentId,
        [primaryEnvironmentId, secondaryEnvironmentId],
      ),
    ).toBe(primaryEnvironmentId);
  });
});

describe("findDuplicateEmptyChatThreadIds", () => {
  it("removes older empty default chats while preserving the newest per environment", () => {
    const duplicateId = ThreadId.make("thread-duplicate");
    const keptId = ThreadId.make("thread-kept");
    const ids = findDuplicateEmptyChatThreadIds(
      [
        {
          environmentId: primaryEnvironmentId,
          id: duplicateId,
          scope: "chat",
          projectId: null,
          title: "New chat",
          latestUserMessageAt: null,
          latestTurn: null,
          createdAt: "2026-08-22T10:00:00.000Z",
        },
        {
          environmentId: primaryEnvironmentId,
          id: keptId,
          scope: "chat",
          projectId: null,
          title: "New chat",
          latestUserMessageAt: null,
          latestTurn: null,
          createdAt: "2026-08-22T11:00:00.000Z",
        },
      ],
      null,
    );

    expect(ids).toEqual([duplicateId]);
  });

  it("does not remove titled or active chats", () => {
    const titledId = ThreadId.make("thread-titled");
    const activeId = ThreadId.make("thread-active");
    const ids = findDuplicateEmptyChatThreadIds(
      [
        {
          environmentId: primaryEnvironmentId,
          id: titledId,
          scope: "chat",
          projectId: null,
          title: "Project discussion",
          latestUserMessageAt: null,
          latestTurn: null,
          createdAt: "2026-08-22T10:00:00.000Z",
        },
        {
          environmentId: primaryEnvironmentId,
          id: activeId,
          scope: "chat",
          projectId: null,
          title: "New chat",
          latestUserMessageAt: null,
          latestTurn: null,
          createdAt: "2026-08-22T11:00:00.000Z",
        },
      ],
      activeId,
    );

    expect(ids).toEqual([]);
  });
});
