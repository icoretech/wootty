import { COMMAND_CATALOG } from "./catalog";
import type { TerminalRuntimeCommand } from "./runtime-commands";
import type { ShortcutAction } from "./shortcut-actions";

type CommandHandlerKind = (typeof COMMAND_CATALOG)[number]["handler"];

type CommandRegistry = {
  commandByShortcutCode: Map<string, ShortcutAction>;
  handlerByCommand: Map<ShortcutAction, CommandHandlerKind>;
};

function buildCommandRegistry(): CommandRegistry {
  const commandByShortcutCode = new Map<string, ShortcutAction>();
  const handlerByCommand = new Map<ShortcutAction, CommandHandlerKind>();

  for (const command of COMMAND_CATALOG) {
    if (commandByShortcutCode.has(command.shortcutCode)) {
      throw new Error(
        `Duplicate shortcut descriptor for key code '${command.shortcutCode}'.`,
      );
    }
    commandByShortcutCode.set(command.shortcutCode, command.id);
    if (handlerByCommand.has(command.id)) {
      throw new Error(
        `Duplicate command handler descriptor for '${command.id}'.`,
      );
    }
    handlerByCommand.set(command.id, command.handler);
  }

  return {
    commandByShortcutCode,
    handlerByCommand,
  };
}

const COMMAND_REGISTRY = buildCommandRegistry();

export function resolveCommandFromShortcutCode(
  code: string,
): ShortcutAction | null {
  return COMMAND_REGISTRY.commandByShortcutCode.get(code) ?? null;
}

export function handlerForCommand(command: ShortcutAction): CommandHandlerKind {
  const handler = COMMAND_REGISTRY.handlerByCommand.get(command);
  if (!handler) {
    throw new Error(`No command handler descriptor found for '${command}'.`);
  }
  return handler;
}

export function isRuntimeCommand(
  command: ShortcutAction,
): command is TerminalRuntimeCommand {
  return handlerForCommand(command) === "runtime";
}
