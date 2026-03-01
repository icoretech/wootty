import type { FloatingControlCommand } from "./floating-controls/actions";
import type { FloatingControlDefinition } from "./floating-controls/contracts";
import { TERMINAL_RUNTIME_COMMAND } from "./runtime-commands";
import type { ShortcutAction } from "./shortcut-actions";
import { VIEWPORT_UI_COMMAND } from "./viewport-commands";

type CommandHandler = "runtime" | "viewport";

type BaseCommandCatalogEntry = {
  id: ShortcutAction;
  handler: CommandHandler;
  shortcutCode: string;
};

type FloatingControlCommandEntry = BaseCommandCatalogEntry & {
  id: FloatingControlCommand;
  floatingControl: FloatingControlDefinition;
};

type NonFloatingControlCommandEntry = BaseCommandCatalogEntry & {
  id: Exclude<ShortcutAction, FloatingControlCommand>;
  floatingControl?: undefined;
};

type CommandCatalogEntry =
  | FloatingControlCommandEntry
  | NonFloatingControlCommandEntry;

export const COMMAND_CATALOG = [
  {
    id: TERMINAL_RUNTIME_COMMAND.RECONNECT,
    handler: "runtime",
    shortcutCode: "KeyR",
    floatingControl: {
      testId: "reconnect-button",
      metadataKey: "reconnect",
      metadata: {
        tooltip: "Reconnect",
        ariaLabel: "Reconnect terminal session",
        ariaKeyShortcuts: "Control+Shift+R Meta+Shift+R",
      },
      policy: {
        isDisabled: (model) => !model.terminalReady,
        resolveIcon: () => "reconnect",
      },
    },
  },
  {
    id: TERMINAL_RUNTIME_COMMAND.CLEAR,
    handler: "runtime",
    shortcutCode: "KeyK",
    floatingControl: {
      testId: "clear-button",
      metadataKey: "clear",
      metadata: {
        tooltip: "Clear",
        ariaLabel: "Clear terminal viewport",
        ariaKeyShortcuts: "Control+Shift+K Meta+Shift+K",
      },
      policy: {
        isDisabled: (model) => !model.terminalReady,
        resolveIcon: () => "clear",
      },
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.DECREASE_FONT,
    handler: "viewport",
    shortcutCode: "Minus",
    floatingControl: {
      testId: "font-decrease-button",
      metadataKey: "decreaseFont",
      metadata: {
        tooltip: "Font down",
        ariaLabel: "Decrease terminal font size",
        ariaKeyShortcuts: "Control+Shift+- Meta+Shift+-",
      },
      policy: {
        isDisabled: (model) =>
          !model.terminalReady || model.fontSize <= model.fontSizeMin,
        resolveIcon: () => "fontDecrease",
      },
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.INCREASE_FONT,
    handler: "viewport",
    shortcutCode: "Equal",
    floatingControl: {
      testId: "font-increase-button",
      metadataKey: "increaseFont",
      metadata: {
        tooltip: "Font up",
        ariaLabel: "Increase terminal font size",
        ariaKeyShortcuts: "Control+Shift+= Meta+Shift+=",
      },
      policy: {
        isDisabled: (model) =>
          !model.terminalReady || model.fontSize >= model.fontSizeMax,
        resolveIcon: () => "fontIncrease",
      },
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.RESET_FONT,
    handler: "viewport",
    shortcutCode: "Digit0",
    floatingControl: {
      testId: "font-reset-button",
      metadataKey: "resetFont",
      metadata: {
        tooltip: "Reset font",
        ariaLabel: "Reset terminal font size",
        ariaKeyShortcuts: "Control+Shift+0 Meta+Shift+0",
      },
      policy: {
        isDisabled: (model) =>
          !model.terminalReady || model.fontSize === model.defaultFontSize,
        resolveIcon: () => "fontReset",
      },
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
    handler: "viewport",
    shortcutCode: "KeyF",
    floatingControl: {
      testId: "fullscreen-button",
      metadataKey: "fullscreen",
      metadata: {
        tooltip: "Fullscreen",
        ariaLabel: "Toggle fullscreen terminal",
      },
      policy: {
        isDisabled: (model) => !model.terminalReady,
        resolveIcon: (model) =>
          model.isFullscreen ? "fullscreenExit" : "fullscreenEnter",
        resolveLabel: (model, defaultLabel) =>
          model.isFullscreen ? "Exit fullscreen terminal" : defaultLabel,
        resolveTooltip: (model, defaultTooltip) =>
          model.isFullscreen ? "Exit fullscreen" : defaultTooltip,
      },
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    handler: "viewport",
    shortcutCode: "KeyB",
  },
] as const satisfies readonly CommandCatalogEntry[];
