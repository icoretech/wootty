import { spawn } from "@lydell/node-pty";

const strict = process.env.PTY_SMOKE_STRICT === "1";

function unique(values: Array<string | undefined>): string[] {
  return [
    ...new Set(
      values.filter((value): value is string =>
        Boolean(value && value.length > 0),
      ),
    ),
  ];
}

const shellCandidates = unique([
  process.env.WOOTTY_PTY_SHELL,
  process.env.SHELL,
  "/bin/bash",
  "/bin/sh",
  "bash",
  "sh",
]);

async function tryShell(shell: string): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;

    const finish = (ok: boolean) => {
      if (done) {
        return;
      }
      done = true;
      resolve(ok);
    };

    try {
      const proc = spawn(shell, [], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env,
      });

      const timeout = setTimeout(() => {
        proc.kill();
        finish(false);
      }, 2_500);

      const disposeData = proc.onData((data) => {
        if (data.length > 0) {
          proc.kill();
          clearTimeout(timeout);
          disposeData.dispose();
          finish(true);
        }
      });

      const disposeExit = proc.onExit(() => {
        clearTimeout(timeout);
        disposeData.dispose();
        disposeExit.dispose();
        finish(false);
      });

      proc.write("echo pty-smoke\n");
    } catch {
      finish(false);
    }
  });
}

async function main(): Promise<void> {
  for (const shell of shellCandidates) {
    const ok = await tryShell(shell);
    if (ok) {
      console.log(`[pty-smoke] OK using shell: ${shell}`);
      process.exit(0);
    }
  }

  const message = `[pty-smoke] FAIL unable to spawn PTY (candidates: ${shellCandidates.join(", ")})`;
  if (strict) {
    console.error(message);
    process.exit(1);
  }

  console.warn(`${message} (non-blocking mode)`);
  process.exit(0);
}

void main();
