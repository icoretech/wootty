import { useEffect } from "react";
import type { ShortcutAction } from "../../commands/shortcut-actions";
import { readShortcutAction } from "../../commands/shortcut-command-map";

type ShortcutBindingArgs = {
  windowRef: Window | null;
  terminalReady: boolean;
  runShortcutAction: (action: ShortcutAction) => void;
};

function targetIsEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (target.closest("[contenteditable='true']")) {
    return true;
  }
  switch (target.tagName) {
    case "INPUT":
    case "TEXTAREA":
    case "SELECT":
      return true;
    default:
      return false;
  }
}

export function useShortcutBinding({
  windowRef,
  terminalReady,
  runShortcutAction,
}: ShortcutBindingArgs): void {
  useEffect(() => {
    if (!terminalReady || !windowRef) {
      return;
    }

    const keyHandler = (event: KeyboardEvent) => {
      if (targetIsEditable(event.target)) {
        return;
      }
      const shortcutAction = readShortcutAction(event);
      if (!shortcutAction) {
        return;
      }
      event.preventDefault();
      runShortcutAction(shortcutAction);
    };

    windowRef.addEventListener("keydown", keyHandler);
    return () => {
      windowRef.removeEventListener("keydown", keyHandler);
    };
  }, [runShortcutAction, terminalReady, windowRef]);
}
