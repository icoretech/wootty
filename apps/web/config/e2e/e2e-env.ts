export const DEFAULT_E2E_PORT = 4310;
const MIN_PORT = 1;
const MAX_PORT = 65_535;

type E2eServerLaunch = {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly command: string;
};

type E2eRuntimeConfig = {
  readonly port: number;
  readonly baseURL: string;
  readonly healthUrl: string;
  readonly crossBrowser: boolean;
  readonly webServer: E2eServerLaunch;
};

export function resolveE2ePort(envPort: string | undefined): number {
  const normalized = envPort?.trim();
  if (!normalized) {
    return DEFAULT_E2E_PORT;
  }

  if (!/^\d+$/u.test(normalized)) {
    return DEFAULT_E2E_PORT;
  }

  const parsed = Number(normalized);
  if (Number.isInteger(parsed) && parsed >= MIN_PORT && parsed <= MAX_PORT) {
    return parsed;
  }

  return DEFAULT_E2E_PORT;
}

function createServerLaunch(port: number): E2eServerLaunch {
  const args = [
    "go",
    "run",
    "./cmd/woottyd",
    "run",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "sh",
  ] as const;
  return {
    cwd: "../server",
    env: {
      WOOTTY_PORT: String(port),
      WOOTTY_FAKE_PTY: "1",
    },
    command: args.join(" "),
  };
}

export function resolveE2eRuntime(
  env: Readonly<Record<string, string | undefined>> = process.env,
): E2eRuntimeConfig {
  const port = resolveE2ePort(env.WOOTTY_E2E_PORT);
  const baseURL = `http://127.0.0.1:${port}`;
  return {
    port,
    baseURL,
    healthUrl: `${baseURL}/api/health`,
    crossBrowser: env.WOOTTY_E2E_CROSS === "1",
    webServer: createServerLaunch(port),
  };
}
