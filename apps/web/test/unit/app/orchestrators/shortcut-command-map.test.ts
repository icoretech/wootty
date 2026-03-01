import { describe, expect, it } from "vitest";
import { TERMINAL_RUNTIME_COMMAND } from "../../../../src/features/terminal/commands/runtime-commands";
import type { ShortcutAction } from "../../../../src/features/terminal/commands/shortcut-actions";
import { readShortcutAction } from "../../../../src/features/terminal/commands/shortcut-command-map";
import { VIEWPORT_UI_COMMAND } from "../../../../src/features/terminal/commands/viewport-commands";

function shortcutEvent(code: string): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    code,
    ctrlKey: true,
    shiftKey: true,
  });
}

describe("shortcut command map", () => {
  it("maps supported shortcuts to terminal commands", () => {
    const pairs: Array<[string, ShortcutAction]> = [
      ["KeyR", TERMINAL_RUNTIME_COMMAND.RECONNECT],
      ["KeyK", TERMINAL_RUNTIME_COMMAND.CLEAR],
      ["Equal", VIEWPORT_UI_COMMAND.INCREASE_FONT],
      ["Minus", VIEWPORT_UI_COMMAND.DECREASE_FONT],
      ["Digit0", VIEWPORT_UI_COMMAND.RESET_FONT],
      ["KeyF", VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN],
      ["KeyB", VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS],
    ];

    for (const [code, expected] of pairs) {
      expect(readShortcutAction(shortcutEvent(code))).toBe(expected);
    }
  });

  it("returns null when modifier contract is not satisfied", () => {
    expect(
      readShortcutAction(
        new KeyboardEvent("keydown", {
          code: "KeyR",
          ctrlKey: true,
          shiftKey: false,
        }),
      ),
    ).toBeNull();
    expect(readShortcutAction(shortcutEvent("KeyX"))).toBeNull();
  });
});
