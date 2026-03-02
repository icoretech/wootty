import { spawn } from "node:child_process";
import { createServer } from "node:net";

const DEFAULT_PORT = 8080;
const MAX_PORT = 65535;
const requestedPortRaw = process.env.WOOTTY_PORT;
const requestedPort = requestedPortRaw ? Number(requestedPortRaw) : DEFAULT_PORT;

if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > MAX_PORT) {
  console.error(`Invalid WOOTTY_PORT value: ${requestedPortRaw}`);
  process.exit(1);
}

async function isPortAvailable(port) {
  const hosts = ["0.0.0.0", "::"];
  for (const host of hosts) {
    // Probe both IPv4 and IPv6 wildcard binds to avoid false "free port" results.
    // eslint-disable-next-line no-await-in-loop
    const hostAvailable = await new Promise((resolve) => {
      const server = createServer();
      server.unref();
      server.on("error", (error) => {
        const code = error?.code;
        if (code === "EAFNOSUPPORT" || code === "EADDRNOTAVAIL") {
          resolve(true);
          return;
        }
        resolve(false);
      });
      server.listen({ host, port }, () => {
        server.close(() => resolve(true));
      });
    });

    if (!hostAvailable) {
      return false;
    }
  }

  return true;
}

async function findAvailablePort(startPort) {
  for (let candidate = startPort; candidate <= MAX_PORT; candidate += 1) {
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No available port found in range ${startPort}-${MAX_PORT}`);
}

const effectivePort = requestedPortRaw
  ? requestedPort
  : await findAvailablePort(requestedPort);

if (!requestedPortRaw && effectivePort !== DEFAULT_PORT) {
  console.warn(
    `[wootty] Port ${DEFAULT_PORT} is in use, falling back to ${effectivePort} for local dev.`,
  );
}

const env = {
  ...process.env,
  WOOTTY_PORT: String(effectivePort),
  WOOTTY_DEV_PROXY_PORT: String(effectivePort),
};

const child = spawn(
  "concurrently",
  [
    "-k",
    "-n",
    "server,web",
    "-c",
    "green,yellow",
    "cd apps/server && go run ./cmd/woottyd run",
    "pnpm --filter @icoretech/wootty-web dev",
  ],
  {
    env,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
