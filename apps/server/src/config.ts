import os from "node:os";

export interface RuntimeConfig {
  host: string;
  port: number;
  reconnectGraceMs: number;
  historyBytes: number;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

const DEFAULT_PORT = 3000;
const DEFAULT_HISTORY_BYTES = 5 * 1024 * 1024;
const DEFAULT_RECONNECT_GRACE_MS = 30_000;

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function splitArgs(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseRunConfig(argv: string[]): RuntimeConfig {
  const args = argv[0] === "run" ? argv.slice(1) : [...argv];

  let host = process.env.WOOTTY_HOST ?? "0.0.0.0";
  let port = parsePositiveInteger(process.env.WOOTTY_PORT, DEFAULT_PORT);
  let reconnectGraceMs = parsePositiveInteger(
    process.env.WOOTTY_RECONNECT_GRACE_MS,
    DEFAULT_RECONNECT_GRACE_MS,
  );
  let historyBytes = parsePositiveInteger(
    process.env.WOOTTY_HISTORY_BYTES,
    DEFAULT_HISTORY_BYTES,
  );

  let commandParts: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];

    if (token === "-n" || token === "--naked") {
      continue;
    }

    if (token === "-p" || token === "--port") {
      port = parsePositiveInteger(args[i + 1], port);
      i += 1;
      continue;
    }

    if (token === "--host") {
      host = args[i + 1] ?? host;
      i += 1;
      continue;
    }

    if (token === "--reconnect-grace-ms") {
      reconnectGraceMs = parsePositiveInteger(args[i + 1], reconnectGraceMs);
      i += 1;
      continue;
    }

    if (token === "--history-bytes") {
      historyBytes = parsePositiveInteger(args[i + 1], historyBytes);
      i += 1;
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown flag: ${token}`);
    }

    commandParts = args.slice(i);
    break;
  }

  if (commandParts.length === 0) {
    const envCommand = process.env.WOOTTY_COMMAND;
    if (envCommand) {
      commandParts = [
        envCommand,
        ...splitArgs(process.env.WOOTTY_COMMAND_ARGS),
      ];
    }
  }

  if (commandParts.length === 0) {
    commandParts = [process.env.SHELL ?? "bash"];
  }

  const [command, ...commandArgs] = commandParts;

  return {
    host,
    port,
    reconnectGraceMs,
    historyBytes,
    command,
    args: commandArgs,
    cwd: process.env.WOOTTY_CWD ?? process.cwd(),
    env: {
      ...process.env,
      TERM: process.env.TERM ?? "xterm-256color",
      HOME: process.env.HOME ?? os.homedir(),
    },
  };
}
