import { COMMAND_CATALOG } from "./catalog";
import type { TerminalRuntimeCommand } from "./runtime-commands";
import type { ShortcutAction } from "./shortcut-actions";

type CommandRegistry = {
  commandByShortcutCode: Map<string, ShortcutAction>;
  runtimeCommands: Set<TerminalRuntimeCommand>;
};

let commandRegistryCache: CommandRegistry | null = null;

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

function getCommandRegistry(): CommandRegistry {
  if (commandRegistryCache) {
    return commandRegistryCache;
  }
  const registry = buildCommandRegistry();
  commandRegistryCache = registry;
  return registry;
}

export function resolveCommandFromShortcutCode(
  code: string,
): ShortcutAction | null {
  return getCommandRegistry().commandByShortcutCode.get(code) ?? null;
}

export function isRuntimeCommand(
  command: ShortcutAction,
): command is TerminalRuntimeCommand {
  return getCommandRegistry().runtimeCommands.has(
    command as TerminalRuntimeCommand,
  );
}
