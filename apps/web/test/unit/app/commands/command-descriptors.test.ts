import { describe, expect, it } from "vitest";
import { COMMAND_CATALOG } from "../../../../src/features/terminal/commands/catalog";
import { FLOATING_CONTROL_REGISTRY } from "../../../../src/features/terminal/commands/floating-controls/catalog";
import { VIEWPORT_UI_COMMAND } from "../../../../src/features/terminal/commands/viewport-commands";

describe("command descriptors", () => {
  it("keeps command ids and shortcut codes unique", () => {
    const ids = new Set(COMMAND_CATALOG.map((descriptor) => descriptor.id));
    const shortcuts = new Set(
      COMMAND_CATALOG.map((descriptor) => descriptor.shortcutCode),
    );
    expect(ids.size).toBe(COMMAND_CATALOG.length);
    expect(shortcuts.size).toBe(COMMAND_CATALOG.length);
  });

  it("keeps toggle-controls out of floating-control registry actions", () => {
    const floatingControlIds = FLOATING_CONTROL_REGISTRY.map(
      (descriptor) => descriptor.action,
    );
    expect(floatingControlIds).not.toContain(
      VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    );
  });
});
