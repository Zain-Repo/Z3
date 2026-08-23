import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

const CHAT_SIDEBAR_PINS_STORAGE_KEY = "z3.chat-sidebar.pins.v1";

export interface ChatSidebarPinStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface ChatSidebarPinRef {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

function getDefaultStorage(): ChatSidebarPinStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function chatSidebarPinKey(ref: ChatSidebarPinRef): string {
  return scopedThreadKey(scopeThreadRef(ref.environmentId, ref.threadId));
}

export function readChatSidebarPins(
  storage: ChatSidebarPinStorage | null = getDefaultStorage(),
): ReadonlySet<string> {
  if (storage === null) return new Set();

  try {
    const value: unknown = JSON.parse(storage.getItem(CHAT_SIDEBAR_PINS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set();
  }
}

export function writeChatSidebarPins(
  pins: ReadonlySet<string>,
  storage: ChatSidebarPinStorage | null = getDefaultStorage(),
): ReadonlySet<string> {
  if (storage === null) return pins;

  try {
    storage.setItem(CHAT_SIDEBAR_PINS_STORAGE_KEY, JSON.stringify([...pins]));
  } catch {
    // Storage may be unavailable in private browsing or when the quota is full.
  }
  return pins;
}

export function setChatSidebarPin(
  pins: ReadonlySet<string>,
  ref: ChatSidebarPinRef,
  pinned: boolean,
  storage: ChatSidebarPinStorage | null = getDefaultStorage(),
): ReadonlySet<string> {
  const next = new Set(pins);
  const key = chatSidebarPinKey(ref);
  if (pinned) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return writeChatSidebarPins(next, storage);
}
