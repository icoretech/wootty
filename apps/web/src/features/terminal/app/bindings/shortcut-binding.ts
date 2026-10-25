import { type RefObject, useEffect } from "react";
import type { ShortcutAction } from "../../commands/shortcut-actions";
import { readShortcutAction } from "../../commands/shortcut-command-map";

type ShortcutBindingArgs = {
  windowRef: Window | null;
  terminalReady: boolean;
  terminalElementRef?: RefObject<HTMLDivElement | null>;
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
  terminalElementRef,
  runShortcutAction,
}: ShortcutBindingArgs): void {
  useEffect(() => {
    if (!terminalReady || !windowRef) {
      return;
    }

    const keyHandler = (event: KeyboardEvent) => {
      const isTerminalInput =
        event.target instanceof Node &&
        terminalElementRef?.current?.contains(event.target);
      if (
        event.isComposing ||
        (targetIsEditable(event.target) && !isTerminalInput)
      ) {
        return;
      }
      const shortcutAction = readShortcutAction(event);
      if (!shortcutAction) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      runShortcutAction(shortcutAction);
    };

    windowRef.addEventListener("keydown", keyHandler, true);
    return () => {
      windowRef.removeEventListener("keydown", keyHandler, true);
    };
  }, [runShortcutAction, terminalElementRef, terminalReady, windowRef]);
}
