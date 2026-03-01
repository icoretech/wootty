import { describe, expect, it } from "vitest";
import { COMMAND_CATALOG } from "../../../src/features/terminal/commands/catalog";
import { VIEWPORT_UI_COMMAND } from "../../../src/features/terminal/commands/viewport-commands";

describe("command catalog", () => {
  it("keeps command ids and shortcuts unique", () => {
    const ids = new Set(COMMAND_CATALOG.map((entry) => entry.id));
    const shortcuts = new Set(
      COMMAND_CATALOG.map((entry) => entry.shortcutCode),
    );

    expect(ids.size).toBe(COMMAND_CATALOG.length);
    expect(shortcuts.size).toBe(COMMAND_CATALOG.length);
  });

  it("keeps floating-control metadata out of toggle-controls command", () => {
    const toggleControls = COMMAND_CATALOG.find(
      (entry) => entry.id === VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    );
    expect(toggleControls).toBeDefined();
    expect(toggleControls?.floatingControl).toBeUndefined();
  });
});
