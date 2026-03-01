import {
  COMMAND_DESCRIPTORS,
  type CommandHandlerKey,
} from "./command-descriptors";
import type { TerminalRuntimeCommand } from "./runtime-commands";
import type { ShortcutAction } from "./shortcut-actions";

type CommandRegistry = {
  commandHandlerByAction: Map<ShortcutAction, CommandHandlerKey>;
  commandByShortcutCode: Map<string, ShortcutAction>;
  runtimeCommands: Set<ShortcutAction>;
};

function buildCommandRegistry(): CommandRegistry {
  const commandHandlerByAction = new Map<ShortcutAction, CommandHandlerKey>();
  const commandByShortcutCode = new Map<string, ShortcutAction>();
  const runtimeCommands = new Set<ShortcutAction>();

  for (const descriptor of COMMAND_DESCRIPTORS) {
    commandHandlerByAction.set(descriptor.id, descriptor.handler);
    commandByShortcutCode.set(descriptor.shortcutCode, descriptor.id);
    if (descriptor.handler === "runtime") {
      runtimeCommands.add(descriptor.id);
    }
  }

  return {
    commandHandlerByAction,
    commandByShortcutCode,
    runtimeCommands,
  };
}

export function resolveCommandFromShortcutCode(
  code: string,
): ShortcutAction | null {
  return buildCommandRegistry().commandByShortcutCode.get(code) ?? null;
}

export function commandHandlerKey(command: ShortcutAction): CommandHandlerKey {
  const handler = buildCommandRegistry().commandHandlerByAction.get(command);
  if (!handler) {
    throw new Error(`missing command handler for '${command}'`);
  }
  return handler;
}

export function isRuntimeCommand(
  command: ShortcutAction,
): command is TerminalRuntimeCommand {
  return buildCommandRegistry().runtimeCommands.has(command);
}
