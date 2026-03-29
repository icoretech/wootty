import {
  TERMINAL_RUNTIME_COMMAND,
  type TerminalRuntimeCommand,
} from "../runtime-commands";
import {
  VIEWPORT_UI_COMMAND,
  type ViewportUiCommand,
} from "../viewport-commands";

type FloatingControlBinding = {
  testId: string;
  metadataKey:
    | "reconnect"
    | "clear"
    | "decreaseFont"
    | "increaseFont"
    | "resetFont"
    | "fullscreen"
    | "help";
};

type RuntimeCommandManifestEntry = {
  id: TerminalRuntimeCommand;
  handler: "runtime";
  shortcutCode: string;
  label?: string;
  floatingControl?: FloatingControlBinding;
};

type ViewportCommandManifestEntry = {
  id: ViewportUiCommand;
  handler: "viewport";
  shortcutCode: string;
  label?: string;
  floatingControl?: FloatingControlBinding;
};

type CommandManifestEntry =
  | RuntimeCommandManifestEntry
  | ViewportCommandManifestEntry;

export const COMMAND_MANIFEST = [
  {
    id: TERMINAL_RUNTIME_COMMAND.RECONNECT,
    handler: "runtime",
    shortcutCode: "KeyR",
    label: "Reconnect",
    floatingControl: {
      testId: "reconnect-button",
      metadataKey: "reconnect",
    },
  },
  {
    id: TERMINAL_RUNTIME_COMMAND.CLEAR,
    handler: "runtime",
    shortcutCode: "KeyK",
    label: "Clear terminal",
    floatingControl: {
      testId: "clear-button",
      metadataKey: "clear",
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.DECREASE_FONT,
    handler: "viewport",
    shortcutCode: "Minus",
    label: "Decrease font size",
    floatingControl: {
      testId: "font-decrease-button",
      metadataKey: "decreaseFont",
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.INCREASE_FONT,
    handler: "viewport",
    shortcutCode: "Equal",
    label: "Increase font size",
    floatingControl: {
      testId: "font-increase-button",
      metadataKey: "increaseFont",
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.RESET_FONT,
    handler: "viewport",
    shortcutCode: "Digit0",
    label: "Reset font size",
    floatingControl: {
      testId: "font-reset-button",
      metadataKey: "resetFont",
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
    handler: "viewport",
    shortcutCode: "KeyF",
    label: "Toggle fullscreen",
    floatingControl: {
      testId: "fullscreen-button",
      metadataKey: "fullscreen",
    },
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
    handler: "viewport",
    shortcutCode: "KeyB",
    label: "Toggle controls",
  },
  {
    id: VIEWPORT_UI_COMMAND.TOGGLE_HELP,
    handler: "viewport",
    shortcutCode: "Period",
    label: "Keyboard shortcuts",
    floatingControl: {
      testId: "help-button",
      metadataKey: "help",
    },
  },
] as const satisfies readonly CommandManifestEntry[];

type CommandManifestWithFloatingControl = Extract<
  (typeof COMMAND_MANIFEST)[number],
  { floatingControl: FloatingControlBinding }
>;

export type CommandManifestFloatingControlMetadataKey =
  CommandManifestWithFloatingControl["floatingControl"]["metadataKey"];

type CommandManifestFloatingControlEntry = {
  action: CommandManifestWithFloatingControl["id"];
  testId: CommandManifestWithFloatingControl["floatingControl"]["testId"];
  metadataKey: CommandManifestWithFloatingControl["floatingControl"]["metadataKey"];
};

export const FLOATING_CONTROL_REGISTRY = Object.freeze(
  COMMAND_MANIFEST.flatMap((entry) => {
    if (!("floatingControl" in entry)) {
      return [];
    }
    return [
      {
        action: entry.id,
        testId: entry.floatingControl.testId,
        metadataKey: entry.floatingControl.metadataKey,
      },
    ];
  }),
) as readonly CommandManifestFloatingControlEntry[];

type CommandFloatingControlMetadata = {
  tooltip: string;
  ariaLabel: string;
  ariaKeyShortcuts?: string;
};

export const COMMAND_FLOATING_CONTROL_METADATA = Object.freeze({
  reconnect: {
    tooltip: "Reconnect",
    ariaLabel: "Reconnect terminal session",
    ariaKeyShortcuts: "Control+Shift+R Meta+Shift+R",
  },
  clear: {
    tooltip: "Clear",
    ariaLabel: "Clear terminal viewport",
    ariaKeyShortcuts: "Control+Shift+K Meta+Shift+K",
  },
  decreaseFont: {
    tooltip: "Font down",
    ariaLabel: "Decrease terminal font size",
    ariaKeyShortcuts: "Control+Shift+- Meta+Shift+-",
  },
  increaseFont: {
    tooltip: "Font up",
    ariaLabel: "Increase terminal font size",
    ariaKeyShortcuts: "Control+Shift+= Meta+Shift+=",
  },
  resetFont: {
    tooltip: "Reset font",
    ariaLabel: "Reset terminal font size",
    ariaKeyShortcuts: "Control+Shift+0 Meta+Shift+0",
  },
  fullscreen: {
    tooltip: "Fullscreen",
    ariaLabel: "Toggle fullscreen terminal",
  },
  help: {
    tooltip: "About",
    ariaLabel: "About WooTTY",
    ariaKeyShortcuts: "Control+Shift+. Meta+Shift+.",
  },
} satisfies Record<
  CommandManifestFloatingControlMetadataKey,
  CommandFloatingControlMetadata
>);
