import { describe, expect, it } from "vitest";
import { COMMAND_MANIFEST } from "../../../../src/features/terminal/commands/definitions/command-manifest";
import { VIEWPORT_UI_COMMAND } from "../../../../src/features/terminal/commands/viewport-commands";

describe("command catalog", () => {
  it("keeps command ids and shortcuts unique", () => {
    const ids = new Set(COMMAND_MANIFEST.map((entry) => entry.id));
    const shortcuts = new Set(
      COMMAND_MANIFEST.map((entry) => entry.shortcutCode),
    );

    expect(ids.size).toBe(COMMAND_MANIFEST.length);
    expect(shortcuts.size).toBe(COMMAND_MANIFEST.length);
  });

  it("keeps toggle-controls command in the viewport command set", () => {
    const toggleControls = COMMAND_MANIFEST.find(
      (entry) => entry.id === VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    );
    expect(toggleControls).toEqual(
      expect.objectContaining({
        id: VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
        handler: "viewport",
        shortcutCode: "KeyB",
      }),
    );
  });
});
