import { resolveCommandFromShortcutCode } from "./command-registry";
import type { ShortcutAction } from "./shortcut-actions";

export function readShortcutAction(
  event: KeyboardEvent,
): ShortcutAction | null {
  const ctrlOrMeta = event.ctrlKey || event.metaKey;
  if (!ctrlOrMeta || !event.shiftKey) {
    return null;
  }

  return resolveCommandFromShortcutCode(event.code);
}
