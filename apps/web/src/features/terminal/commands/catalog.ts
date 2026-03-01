import type { FloatingControlMetadataKey } from "./floating-controls/contracts";
import { TERMINAL_RUNTIME_COMMAND } from "./runtime-commands";
import type { ShortcutAction } from "./shortcut-actions";
import { VIEWPORT_UI_COMMAND } from "./viewport-commands";

type CommandHandler = "runtime" | "viewport";

type BaseCommandCatalogEntry = {
  id: ShortcutAction;
  handler: CommandHandler;
  shortcutCode: string;
  floatingControl?: {
    testId: string;
    metadataKey: FloatingControlMetadataKey;
  };
};

type CommandCatalogEntry = BaseCommandCatalogEntry & {
  id: ShortcutAction;
};

export const COMMAND_CATALOG = [
  {
    id: TERMINAL_RUNTIME_COMMAND.RECONNECT,
    handler: "runtime",
    shortcutCode: "KeyR",
    floatingControl: {
      testId: "reconnect-button",
      metadataKey: "reconnect",
    },
  },
  {
    id: TERMINAL_RUNTIME_COMMAND.CLEAR,
    handler: "runtime",
    shortcutCode: "KeyK",
    floatingControl: {
      testId: "clear-button",
      metadataKey: "clear",
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.DECREASE_FONT,
    handler: "viewport",
    shortcutCode: "Minus",
    floatingControl: {
      testId: "font-decrease-button",
      metadataKey: "decreaseFont",
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.INCREASE_FONT,
    handler: "viewport",
    shortcutCode: "Equal",
    floatingControl: {
      testId: "font-increase-button",
      metadataKey: "increaseFont",
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.RESET_FONT,
    handler: "viewport",
    shortcutCode: "Digit0",
    floatingControl: {
      testId: "font-reset-button",
      metadataKey: "resetFont",
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
    handler: "viewport",
    shortcutCode: "KeyF",
    floatingControl: {
      testId: "fullscreen-button",
      metadataKey: "fullscreen",
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    handler: "viewport",
    shortcutCode: "KeyB",
  },
] as const satisfies readonly CommandCatalogEntry[];
