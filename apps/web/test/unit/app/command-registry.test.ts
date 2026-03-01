import { describe, expect, it } from "vitest";
import {
  commandHandlerKey,
  isRuntimeCommand,
  resolveCommandFromShortcutCode,
} from "../../../src/features/terminal/commands/command-registry";
import { TERMINAL_RUNTIME_COMMAND } from "../../../src/features/terminal/commands/runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../../../src/features/terminal/commands/viewport-commands";
import { floatingControlMetadata } from "../../../src/features/terminal/presentation/command-ui/floating-control-metadata";

describe("terminal command registry", () => {
  it("maps shortcut codes to command ids", () => {
    expect(resolveCommandFromShortcutCode("KeyR")).toBe(
      TERMINAL_RUNTIME_COMMAND.RECONNECT,
    );
    expect(resolveCommandFromShortcutCode("KeyB")).toBe(
      VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    );
    expect(resolveCommandFromShortcutCode("KeyX")).toBeNull();
  });

  it("provides centralized handler routing and runtime classification", () => {
    expect(commandHandlerKey(TERMINAL_RUNTIME_COMMAND.CLEAR)).toBe("runtime");
    expect(commandHandlerKey(VIEWPORT_UI_COMMAND.RESET_FONT)).toBe("viewport");
    expect(isRuntimeCommand(TERMINAL_RUNTIME_COMMAND.CLEAR)).toBe(true);
    expect(isRuntimeCommand(VIEWPORT_UI_COMMAND.RESET_FONT)).toBe(false);
  });

  it("keeps floating-control metadata in presentation layer", () => {
    expect(
      floatingControlMetadata(TERMINAL_RUNTIME_COMMAND.CLEAR),
    ).toMatchObject({
      tooltip: "Clear",
      ariaLabel: "Clear terminal viewport",
    });
  });
});
