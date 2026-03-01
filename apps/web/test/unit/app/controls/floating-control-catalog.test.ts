import { describe, expect, it } from "vitest";
import { COMMAND_MANIFEST } from "../../../../src/features/terminal/commands/definitions/command-manifest";
import { FLOATING_CONTROL_CATALOG } from "../../../../src/features/terminal/commands/floating-controls/catalog";
import { VIEWPORT_UI_COMMAND } from "../../../../src/features/terminal/commands/viewport-commands";

describe("floating control catalog", () => {
  it("keeps floating control actions aligned with known commands", () => {
    const commandActions = new Set(COMMAND_MANIFEST.map((entry) => entry.id));
    for (const entry of FLOATING_CONTROL_CATALOG) {
      expect(commandActions.has(entry.action)).toBe(true);
    }
  });

  it("never includes toggle-controls as a floating control action", () => {
    expect(FLOATING_CONTROL_CATALOG.map((entry) => entry.action)).not.toContain(
      VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    );
  });
});
