import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function pipeWithPrefix(stream, writer, prefix) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      writer.write(`${prefix} ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      writer.write(`${prefix} ${buffer}\n`);
    }
  });
}

function startProcess(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (child.stdout) {
    pipeWithPrefix(child.stdout, process.stdout, `[${name}]`);
  }
  if (child.stderr) {
    pipeWithPrefix(child.stderr, process.stderr, `[${name}]`);
  }

  return child;
}

const server = startProcess("server", "go", ["run", "./cmd/woottyd", "run"], path.join(repoRoot, "apps/server"));
const web = startProcess(
  "web",
  "pnpm",
  ["exec", "vite", "--config", "config/build/vite.config.ts"],
  path.join(repoRoot, "apps/web"),
);

let shuttingDown = false;
let remaining = 2;
let finalExitCode = 0;

function stopChildren(signal) {
  for (const child of [server, web]) {
    if (!child.killed && child.exitCode === null) {
      child.kill(signal);
    }
  }
}

function beginShutdown(signal, exitCode) {
  if (typeof exitCode === "number") {
    finalExitCode = Math.max(finalExitCode, exitCode);
  }
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  stopChildren(signal);
}

process.on("SIGINT", () => {
  beginShutdown("SIGINT", 0);
});
process.on("SIGTERM", () => {
  beginShutdown("SIGTERM", 0);
});

function bindLifecycle(name, child) {
  child.on("error", (error) => {
    process.stderr.write(`[${name}] failed to start: ${error.message}\n`);
    beginShutdown("SIGTERM", 1);
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      if (signal !== null || (code ?? 0) !== 0) {
        beginShutdown("SIGTERM", 1);
      } else {
        beginShutdown("SIGTERM", 0);
      }
    }

    remaining -= 1;
    if (remaining === 0) {
      process.exit(finalExitCode);
    }
  });
}

bindLifecycle("server", server);
bindLifecycle("web", web);
