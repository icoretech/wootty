import { describe, expect, it } from "vitest";
import { COMMAND_DESCRIPTORS } from "../../../src/features/terminal/commands/command-descriptors";
import { FLOATING_CONTROL_REGISTRY } from "../../../src/features/terminal/commands/floating-controls/registry";
import { VIEWPORT_UI_COMMAND } from "../../../src/features/terminal/commands/viewport-commands";

describe("command descriptors", () => {
  it("keeps command ids and shortcut codes unique", () => {
    const ids = new Set(COMMAND_DESCRIPTORS.map((descriptor) => descriptor.id));
    const shortcuts = new Set(
      COMMAND_DESCRIPTORS.map((descriptor) => descriptor.shortcutCode),
    );
    expect(ids.size).toBe(COMMAND_DESCRIPTORS.length);
    expect(shortcuts.size).toBe(COMMAND_DESCRIPTORS.length);
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
