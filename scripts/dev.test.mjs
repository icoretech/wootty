import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wootty-dev-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await Promise.all(
    ["scripts", "apps/server", "apps/web", "bin"].map((directory) =>
      fs.mkdir(path.join(root, directory), { recursive: true }),
    ),
  );
  await fs.copyFile(
    new URL("./dev.mjs", import.meta.url),
    path.join(root, "scripts/dev.mjs"),
  );
  return root;
}

function launch(context, root) {
  const child = spawn(process.execPath, [path.join(root, "scripts/dev.mjs")], {
    env: { ...process.env, PATH: path.join(root, "bin"), WOOTTY_PORT: "43199" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  return child;
}

test("development launcher exits when commands cannot be spawned", {
  timeout: 10_000,
}, async (context) => {
  // Given
  const root = await fixture(context);
  // When
  const child = launch(context, root);
  const [code] = await once(child, "close");
  // Then
  assert.equal(code, 1);
});

test("development launcher terminates command descendants on shutdown", {
  timeout: 10_000,
}, async (context) => {
  // Given
  const root = await fixture(context);
  const helper = `#!${process.execPath}\nimport {spawn} from 'node:child_process';\nconst child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{process.stdout.write('descendant-stopped\\\\n');process.exit(0)});process.stdout.write('descendant-ready\\\\n');setInterval(()=>{},1000)"],{stdio:'inherit'});\nprocess.on('SIGTERM',()=>{});\nchild.on('close',()=>process.exit(0));\n`;
  for (const name of ["go", "pnpm"]) {
    await fs.writeFile(path.join(root, "bin", name), helper, { mode: 0o755 });
  }
  const child = launch(context, root);
  let output = "";
  const closed = once(child, "close");
  const ready = new Promise((resolve) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if ((output.match(/descendant-ready/g) ?? []).length === 2) resolve();
    });
  });
  await ready;
  // When
  child.kill("SIGTERM");
  const [code] = await closed;
  // Then
  assert.equal(code, 0);
  assert.equal((output.match(/descendant-stopped/g) ?? []).length, 2);
});
