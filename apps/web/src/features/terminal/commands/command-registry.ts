import { COMMAND_DESCRIPTORS } from "./command-descriptors";
import type { TerminalRuntimeCommand } from "./runtime-commands";
import type { ShortcutAction } from "./shortcut-actions";

type CommandRegistry = {
  commandByShortcutCode: Map<string, ShortcutAction>;
  runtimeCommands: Set<TerminalRuntimeCommand>;
};

function buildCommandRegistry(): CommandRegistry {
  const commandByShortcutCode = new Map<string, ShortcutAction>();
  const runtimeCommands = new Set<TerminalRuntimeCommand>();

  for (const descriptor of COMMAND_DESCRIPTORS) {
    if (commandByShortcutCode.has(descriptor.shortcutCode)) {
      throw new Error(
        `Duplicate shortcut descriptor for key code '${descriptor.shortcutCode}'.`,
      );
    }
    commandByShortcutCode.set(descriptor.shortcutCode, descriptor.id);
    if (descriptor.handler === "runtime") {
      runtimeCommands.add(descriptor.id);
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
