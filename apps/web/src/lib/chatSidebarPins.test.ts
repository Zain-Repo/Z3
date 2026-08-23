import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  chatSidebarPinKey,
  readChatSidebarPins,
  setChatSidebarPin,
  type ChatSidebarPinStorage,
} from "./chatSidebarPins";

function createStorage(initialValue: string | null = null): ChatSidebarPinStorage & {
  value: string | null;
} {
  let value = initialValue;
  return {
    get value() {
      return value;
    },
    getItem: () => value,
    setItem: (_key, nextValue) => {
      value = nextValue;
    },
  };
}

const environmentOne = EnvironmentId.make("environment-one");
const environmentTwo = EnvironmentId.make("environment-two");
const threadId = ThreadId.make("thread-1");

describe("chatSidebarPins", () => {
  it("keeps identical thread ids distinct across environments", () => {
    const storage = createStorage();
    const firstRef = { environmentId: environmentOne, threadId };
    const secondRef = { environmentId: environmentTwo, threadId };

    const pins = setChatSidebarPin(new Set(), firstRef, true, storage);

    expect(pins).toContain(chatSidebarPinKey(firstRef));
    expect(pins).not.toContain(chatSidebarPinKey(secondRef));
    expect(readChatSidebarPins(storage)).toEqual(new Set([chatSidebarPinKey(firstRef)]));
  });

  it("adds and removes pins through the persistent helper", () => {
    const storage = createStorage();
    const ref = { environmentId: environmentOne, threadId };

    const pinned = setChatSidebarPin(new Set(), ref, true, storage);
    const unpinned = setChatSidebarPin(pinned, ref, false, storage);

    expect(unpinned).toEqual(new Set());
    expect(readChatSidebarPins(storage)).toEqual(new Set());
  });

  it("ignores malformed persisted values", () => {
    expect(readChatSidebarPins(createStorage("{not json"))).toEqual(new Set());
    expect(readChatSidebarPins(createStorage(JSON.stringify({ threadId: "thread-1" })))).toEqual(
      new Set(),
    );
    expect(readChatSidebarPins(createStorage(JSON.stringify(["valid", 42, null])))).toEqual(
      new Set(["valid"]),
    );
  });
});
