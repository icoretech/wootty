import { TerminalBootstrapInvariantError } from "../shared/errors/terminal-bootstrap-invariant";
import { COMMAND_MANIFEST } from "./definitions/command-manifest";
import type { TerminalRuntimeCommand } from "./runtime-commands";
import type { ShortcutAction } from "./shortcut-actions";
import type { ViewportUiCommand } from "./viewport-commands";

type CommandHandlerKind = (typeof COMMAND_MANIFEST)[number]["handler"];

type CommandRegistry = {
  commandByShortcutCode: Map<string, ShortcutAction>;
  handlerByCommand: Map<ShortcutAction, CommandHandlerKind>;
};

function buildCommandRegistry(): CommandRegistry {
  const commandByShortcutCode = new Map<string, ShortcutAction>();
  const handlerByCommand = new Map<ShortcutAction, CommandHandlerKind>();

  for (const command of COMMAND_MANIFEST) {
    if (commandByShortcutCode.has(command.shortcutCode)) {
      throw new TerminalBootstrapInvariantError(
        `Duplicate shortcut descriptor for key code '${command.shortcutCode}'.`,
      );
    }
    commandByShortcutCode.set(command.shortcutCode, command.id);
    if (handlerByCommand.has(command.id)) {
      throw new TerminalBootstrapInvariantError(
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

let cachedRegistry: CommandRegistry | null = null;

function getCommandRegistry(): CommandRegistry {
  if (cachedRegistry === null) {
    cachedRegistry = buildCommandRegistry();
  }
  return cachedRegistry;
}

export function resolveCommandFromShortcutCode(
  code: string,
): ShortcutAction | null {
  return getCommandRegistry().commandByShortcutCode.get(code) ?? null;
}

function resolveHandlerForCommand(command: ShortcutAction): CommandHandlerKind {
  const handler = getCommandRegistry().handlerByCommand.get(command);
  if (!handler) {
    throw new TerminalBootstrapInvariantError(
      `No command handler descriptor found for '${command}'.`,
    );
  }
  return handler;
}

export function isRuntimeCommand(
  command: ShortcutAction,
): command is TerminalRuntimeCommand {
  return resolveHandlerForCommand(command) === "runtime";
}

type CommandDispatchHandlers = {
  runtime: Record<TerminalRuntimeCommand, () => void>;
  viewport: Record<ViewportUiCommand, () => void>;
};

export function dispatchCommand(
  command: ShortcutAction,
  handlers: CommandDispatchHandlers,
): void {
  if (isRuntimeCommand(command)) {
    handlers.runtime[command]();
    return;
  }
  handlers.viewport[command]();
}
