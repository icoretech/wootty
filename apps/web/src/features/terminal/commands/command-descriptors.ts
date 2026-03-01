import { TERMINAL_RUNTIME_COMMAND } from "./runtime-commands";
import type { ShortcutAction } from "./shortcut-actions";
import { VIEWPORT_UI_COMMAND } from "./viewport-commands";

type CommandHandlerKey = "runtime" | "viewport";

type CommandDescriptor = {
  id: ShortcutAction;
  handler: CommandHandlerKey;
  shortcutCode: string;
};

export const COMMAND_DESCRIPTORS: readonly CommandDescriptor[] = [
  {
    id: TERMINAL_RUNTIME_COMMAND.RECONNECT,
    handler: "runtime",
    shortcutCode: "KeyR",
  },
  {
    id: TERMINAL_RUNTIME_COMMAND.CLEAR,
    handler: "runtime",
    shortcutCode: "KeyK",
  },
  {
    id: VIEWPORT_UI_COMMAND.DECREASE_FONT,
    handler: "viewport",
    shortcutCode: "Minus",
  },
  {
    id: VIEWPORT_UI_COMMAND.INCREASE_FONT,
    handler: "viewport",
    shortcutCode: "Equal",
  },
  {
    id: VIEWPORT_UI_COMMAND.RESET_FONT,
    handler: "viewport",
    shortcutCode: "Digit0",
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
    handler: "viewport",
    shortcutCode: "KeyF",
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    handler: "viewport",
    shortcutCode: "KeyB",
  },
] as const;
