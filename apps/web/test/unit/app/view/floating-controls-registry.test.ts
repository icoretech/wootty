import { describe, expect, it } from "vitest";
import { FLOATING_CONTROL_REGISTRY } from "../../../../src/features/terminal/commands/floating-controls/catalog";
import { TERMINAL_RUNTIME_COMMAND } from "../../../../src/features/terminal/commands/runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../../../../src/features/terminal/commands/viewport-commands";

describe("floating controls registry", () => {
  it("declares a stable ordered mapping between actions and metadata keys", () => {
    expect(FLOATING_CONTROL_REGISTRY).toEqual([
      {
        testId: "reconnect-button",
        metadataKey: "reconnect",
        action: TERMINAL_RUNTIME_COMMAND.RECONNECT,
      },
      {
        testId: "clear-button",
        metadataKey: "clear",
        action: TERMINAL_RUNTIME_COMMAND.CLEAR,
      },
      {
        testId: "font-decrease-button",
        metadataKey: "decreaseFont",
        action: VIEWPORT_UI_COMMAND.DECREASE_FONT,
      },
      {
        testId: "font-increase-button",
        metadataKey: "increaseFont",
        action: VIEWPORT_UI_COMMAND.INCREASE_FONT,
      },
      {
        testId: "font-reset-button",
        metadataKey: "resetFont",
        action: VIEWPORT_UI_COMMAND.RESET_FONT,
      },
      {
        testId: "fullscreen-button",
        metadataKey: "fullscreen",
        action: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
      },
      {
        testId: "help-button",
        metadataKey: "help",
        action: VIEWPORT_UI_COMMAND.TOGGLE_HELP,
      },
    ]);
  });
});
