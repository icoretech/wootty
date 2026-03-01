import { COMMAND_CATALOG } from "./catalog";
import type { TerminalRuntimeCommand } from "./runtime-commands";
import type { ShortcutAction } from "./shortcut-actions";

type CommandRegistry = {
  commandByShortcutCode: Map<string, ShortcutAction>;
  runtimeCommands: Set<TerminalRuntimeCommand>;
};

function buildCommandRegistry(): CommandRegistry {
  const commandByShortcutCode = new Map<string, ShortcutAction>();
  const runtimeCommands = new Set<TerminalRuntimeCommand>();

  for (const command of COMMAND_CATALOG) {
    if (commandByShortcutCode.has(command.shortcutCode)) {
      throw new Error(
        `Duplicate shortcut descriptor for key code '${command.shortcutCode}'.`,
      );
    }
    commandByShortcutCode.set(command.shortcutCode, command.id);
    if (command.handler === "runtime") {
      runtimeCommands.add(command.id);
    }
  }

  return {
    commandByShortcutCode,
    runtimeCommands,
  };
}

const COMMAND_REGISTRY = buildCommandRegistry();

export function resolveCommandFromShortcutCode(
  code: string,
): ShortcutAction | null {
  return COMMAND_REGISTRY.commandByShortcutCode.get(code) ?? null;
}

export function isRuntimeCommand(
  command: ShortcutAction,
): command is TerminalRuntimeCommand {
  return COMMAND_REGISTRY.runtimeCommands.has(
    command as TerminalRuntimeCommand,
  );
}
