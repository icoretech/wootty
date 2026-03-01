import { COMMAND_CATALOG } from "./catalog";
import type { TerminalRuntimeCommand } from "./runtime-commands";
import type { ViewportUiCommand } from "./viewport-commands";

type CommandDescriptor =
  | {
      id: TerminalRuntimeCommand;
      handler: "runtime";
      shortcutCode: string;
    }
  | {
      id: ViewportUiCommand;
      handler: "viewport";
      shortcutCode: string;
    };

export const COMMAND_DESCRIPTORS: readonly CommandDescriptor[] =
  COMMAND_CATALOG.map((entry) => ({
    id: entry.id,
    handler: entry.handler,
    shortcutCode: entry.shortcutCode,
  })) as readonly CommandDescriptor[];
