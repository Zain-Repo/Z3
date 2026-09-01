import { useEffect, useState } from "react";

export interface ShortcutModifierState {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const EMPTY_SHORTCUT_MODIFIER_STATE: ShortcutModifierState = {
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
};

export function areShortcutModifierStatesEqual(
  left: ShortcutModifierState,
  right: ShortcutModifierState,
): boolean {
  return (
    left.metaKey === right.metaKey &&
    left.ctrlKey === right.ctrlKey &&
    left.altKey === right.altKey &&
    left.shiftKey === right.shiftKey
  );
}

export function useShortcutModifierState(): ShortcutModifierState {
  const [state, setState] = useState(EMPTY_SHORTCUT_MODIFIER_STATE);

  useEffect(() => {
    const onKeyboardEvent = (event: KeyboardEvent) => {
      setState((current) => shortcutModifierStateAfterKeyboardEvent(current, event));
    };
    const onPaste = (event: ClipboardEvent) => {
      setState((current) => shortcutModifierStateAfterPaste(current, event));
    };
    const onWindowBlur = () => {
      setState((current) =>
        areShortcutModifierStatesEqual(current, EMPTY_SHORTCUT_MODIFIER_STATE)
          ? current
          : EMPTY_SHORTCUT_MODIFIER_STATE,
      );
    };

    window.addEventListener("keydown", onKeyboardEvent, true);
    window.addEventListener("keyup", onKeyboardEvent, true);
    window.addEventListener("paste", onPaste, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyboardEvent, true);
      window.removeEventListener("keyup", onKeyboardEvent, true);
      window.removeEventListener("paste", onPaste, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  return state;
}

function normalizeModifierKey(key: string): keyof ShortcutModifierState | "altGraph" | null {
  switch (key) {
    case "Meta":
    case "OS":
    case "Command":
      return "metaKey";
    case "Control":
      return "ctrlKey";
    case "Alt":
    case "Option":
      return "altKey";
    case "AltGraph":
      return "altGraph";
    case "Shift":
      return "shiftKey";
    default:
      return null;
  }
}

export function shortcutModifierStateAfterKeyboardEvent(
  currentState: ShortcutModifierState,
  event: KeyboardEvent,
): ShortcutModifierState {
  const normalizedModifierKey = normalizeModifierKey(event.key);
  let nextState: ShortcutModifierState;
  if (normalizedModifierKey === "altGraph") {
    nextState = {
      ...currentState,
      ctrlKey: event.type === "keydown",
      altKey: event.type === "keydown",
    };
  } else if (normalizedModifierKey) {
    nextState = {
      ...currentState,
      [normalizedModifierKey]: event.type === "keydown",
    };
  } else {
    // Non-modifier events can clear stale browser flags, but only a real
    // modifier keydown may mark a modifier as held.
    nextState = {
      metaKey: currentState.metaKey && event.metaKey,
      ctrlKey: currentState.ctrlKey && event.ctrlKey,
      altKey: currentState.altKey && event.altKey,
      shiftKey: currentState.shiftKey && event.shiftKey,
    };
  }

  return areShortcutModifierStatesEqual(currentState, nextState) ? currentState : nextState;
}

export function shortcutModifierStateAfterPaste(
  currentState: ShortcutModifierState,
  event: Pick<ClipboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
): ShortcutModifierState {
  // Preserve a real Cmd/Ctrl+V chord. Synthetic dictation pastes normally
  // report no modifier flags, so those still clear a stuck shortcut state.
  const hasReportedModifier = event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
  if (
    hasReportedModifier ||
    areShortcutModifierStatesEqual(currentState, EMPTY_SHORTCUT_MODIFIER_STATE)
  ) {
    return currentState;
  }
  return EMPTY_SHORTCUT_MODIFIER_STATE;
}
