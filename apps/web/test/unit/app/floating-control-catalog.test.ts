import { describe, expect, it } from "vitest";
import { COMMAND_CATALOG } from "../../../src/features/terminal/commands/catalog";
import { FLOATING_CONTROL_CATALOG } from "../../../src/features/terminal/commands/floating-controls/catalog";
import { VIEWPORT_UI_COMMAND } from "../../../src/features/terminal/commands/viewport-commands";

describe("floating control catalog", () => {
  it("derives floating controls from command catalog entries", () => {
    const expectedActions = COMMAND_CATALOG.filter(
      (entry) => typeof entry.floatingControl !== "undefined",
    ).map((entry) => entry.id);
    const actualActions = FLOATING_CONTROL_CATALOG.map((entry) => entry.action);

    expect(actualActions).toEqual(expectedActions);
  });

  it("never includes toggle-controls as a floating control action", () => {
    expect(FLOATING_CONTROL_CATALOG.map((entry) => entry.action)).not.toContain(
      VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    );
  });
});
