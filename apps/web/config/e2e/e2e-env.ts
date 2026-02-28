export const DEFAULT_E2E_PORT = 4310;
const MIN_PORT = 1;
const MAX_PORT = 65_535;

type E2eNetworkConfig = {
  readonly port: number;
  readonly baseURL: string;
  readonly healthUrl: string;
};

type E2eServerLaunch = {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly args: readonly string[];
};

export function resolveE2ePort(envPort: string | undefined): number {
  const normalized = envPort?.trim();
  if (!normalized) {
    return DEFAULT_E2E_PORT;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isInteger(parsed) && parsed >= MIN_PORT && parsed <= MAX_PORT) {
    return parsed;
  }

  return DEFAULT_E2E_PORT;
}

export function resolveE2eBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export function buildE2eConfig(port: number): E2eNetworkConfig {
  const baseURL = resolveE2eBaseUrl(port);
  return {
    port,
    baseURL,
    healthUrl: `${baseURL}/api/health`,
  };
}

export function buildE2eServerLaunch(port: number): E2eServerLaunch {
  return {
    cwd: "../server",
    env: {
      WOOTTY_PORT: String(port),
      WOOTTY_FAKE_PTY: "1",
    },
    args: [
      "go",
      "run",
      "./cmd/woottyd",
      "run",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "sh",
    ],
  };
}

function stringifyLaunchEnv(env: Readonly<Record<string, string>>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

export function buildE2eServerCommand(port: number): string {
  const launch = buildE2eServerLaunch(port);
  const env = stringifyLaunchEnv(launch.env);
  return `cd ${launch.cwd} && ${env} ${launch.args.join(" ")}`;
}
