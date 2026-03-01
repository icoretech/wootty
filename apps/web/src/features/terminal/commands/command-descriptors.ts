import type { FloatingControlCommand } from "./floating-controls-actions";
import { TERMINAL_RUNTIME_COMMAND } from "./runtime-commands";
import type { ShortcutAction } from "./shortcut-actions";
import { VIEWPORT_UI_COMMAND } from "./viewport-commands";

export type CommandHandlerKey = "runtime" | "viewport";

type CommandDescriptor = {
  id: ShortcutAction;
  handler: CommandHandlerKey;
  shortcutCode: string;
  floatingControlId?: FloatingControlCommand;
};

export const COMMAND_DESCRIPTORS: readonly CommandDescriptor[] = [
  {
    id: TERMINAL_RUNTIME_COMMAND.RECONNECT,
    handler: "runtime",
    shortcutCode: "KeyR",
    floatingControlId: TERMINAL_RUNTIME_COMMAND.RECONNECT,
  },
  {
    id: TERMINAL_RUNTIME_COMMAND.CLEAR,
    handler: "runtime",
    shortcutCode: "KeyK",
    floatingControlId: TERMINAL_RUNTIME_COMMAND.CLEAR,
  },
  {
    id: VIEWPORT_UI_COMMAND.DECREASE_FONT,
    handler: "viewport",
    shortcutCode: "Minus",
    floatingControlId: VIEWPORT_UI_COMMAND.DECREASE_FONT,
  },
  {
    id: VIEWPORT_UI_COMMAND.INCREASE_FONT,
    handler: "viewport",
    shortcutCode: "Equal",
    floatingControlId: VIEWPORT_UI_COMMAND.INCREASE_FONT,
  },
  {
    id: VIEWPORT_UI_COMMAND.RESET_FONT,
    handler: "viewport",
    shortcutCode: "Digit0",
    floatingControlId: VIEWPORT_UI_COMMAND.RESET_FONT,
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
    handler: "viewport",
    shortcutCode: "KeyF",
    floatingControlId: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    handler: "viewport",
    shortcutCode: "KeyB",
  },
] as const;
