import { describe, expect, it } from "vitest";
import {
  COMMAND_MANIFEST,
  FLOATING_CONTROL_REGISTRY,
} from "../../../../src/features/terminal/commands/definitions/command-manifest";
import { VIEWPORT_UI_COMMAND } from "../../../../src/features/terminal/commands/viewport-commands";

describe("command manifest", () => {
  it("keeps command ids and shortcuts unique", () => {
    const ids = new Set(COMMAND_MANIFEST.map((entry) => entry.id));
    const shortcuts = new Set(
      COMMAND_MANIFEST.map((entry) => entry.shortcutCode),
    );

    expect(ids.size).toBe(COMMAND_MANIFEST.length);
    expect(shortcuts.size).toBe(COMMAND_MANIFEST.length);
  });

  it("derives floating-control registry from manifest entries", () => {
    const floatingEntries = COMMAND_MANIFEST.filter((entry) => {
      return "floatingControl" in entry;
    }).map((entry) => {
      return {
        action: entry.id,
        testId: entry.floatingControl.testId,
        metadataKey: entry.floatingControl.metadataKey,
      };
    });

    expect(FLOATING_CONTROL_REGISTRY).toEqual(floatingEntries);
  });

  it("keeps toggle-controls command without floating-control metadata", () => {
    const toggleControls = COMMAND_MANIFEST.find((entry) => {
      return entry.id === VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS;
    });

    expect(toggleControls).toEqual(
      expect.objectContaining({
        id: VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
        handler: "viewport",
        shortcutCode: "KeyB",
      }),
    );
    expect(toggleControls).not.toHaveProperty("floatingControl");
  });
});
