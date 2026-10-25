import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const script = fileURLToPath(new URL("./lint-go.mjs", import.meta.url));
const goMod = await fs.readFile(
  new URL("../apps/server/go.mod", import.meta.url),
  "utf8",
);
const goVersion = /^go (.+)$/m.exec(goMod)?.[1];

async function fixture(context, source) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wootty-lint-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const server = path.join(root, "apps/server");
  await fs.mkdir(server, { recursive: true });
  await fs.writeFile(
    path.join(server, "go.mod"),
    `module example.com/sample\n\ngo ${goVersion}\n`,
  );
  await fs.writeFile(path.join(server, "sample.go"), source);
  return root;
}

test("check mode rejects available Go fixes without changing source", async (context) => {
  // Given
  const source =
    "package sample\n\nfunc Identity(value interface{}) interface{} { return value }\n";
  const cwd = await fixture(context, source);
  // When
  await assert.rejects(run(process.execPath, [script, "--check"], { cwd }));
  // Then
  assert.equal(
    await fs.readFile(path.join(cwd, "apps/server/sample.go"), "utf8"),
    source,
  );
});

test("write mode applies fixes and formatting before a successful check", async (context) => {
  // Given
  const cwd = await fixture(
    context,
    "package sample\nfunc Identity(value interface{}) interface{}{return value}\n",
  );
  // When
  await run(process.execPath, [script], { cwd });
  // Then
  await run(process.execPath, [script, "--check"], { cwd });
  assert.match(
    await fs.readFile(path.join(cwd, "apps/server/sample.go"), "utf8"),
    /value any/,
  );
});

test("check mode rejects a broken Go package", async (context) => {
  // Given
  const cwd = await fixture(
    context,
    "package sample\nfunc Broken() { missing() }\n",
  );
  // When / Then
  await assert.rejects(run(process.execPath, [script, "--check"], { cwd }));
});
