import type { TerminalRuntimeCommand } from "./runtime-commands";
import type { ViewportUiCommand } from "./viewport-commands";

export type ShortcutAction = TerminalRuntimeCommand | ViewportUiCommand;
