import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

test("contract check rejects drift without rewriting either generated binding", async (context) => {
  // Given
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "wootty-contracts-"));
  context.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const files = [
    "scripts/generate-terminal-contract-bindings.mjs",
    "apps/web/src/features/terminal/protocol/generated-wire-contract.ts",
    "apps/server/internal/protocol/wire_contract.go",
    "package.json",
    "biome.json",
    ".gitignore",
  ];
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
    await fs.copyFile(path.join(root, file), path.join(cwd, file));
  }
  await fs.cp(path.join(root, "contracts"), path.join(cwd, "contracts"), {
    recursive: true,
  });
  await fs.symlink(
    path.join(root, "node_modules"),
    path.join(cwd, "node_modules"),
  );
  const script = path.join(cwd, files[0]);
  await run(process.execPath, [script, "--check"], { cwd });
  const binding = path.join(cwd, files[1]);
  const stale = (await fs.readFile(binding, "utf8")).replace(
    'SESSIONS_HTTP: "/api/sessions"',
    'SESSIONS_HTTP: "/api/stale"',
  );
  assert.match(stale, /\/api\/stale/);
  await fs.writeFile(binding, stale);
  const serverBefore = await fs.readFile(path.join(cwd, files[2]), "utf8");
  // When
  await assert.rejects(run(process.execPath, [script, "--check"], { cwd }));
  // Then
  assert.equal(await fs.readFile(binding, "utf8"), stale);
  assert.equal(
    await fs.readFile(path.join(cwd, files[2]), "utf8"),
    serverBefore,
  );
  await run(process.execPath, [script], { cwd });
  await run(process.execPath, [script, "--check"], { cwd });
});
