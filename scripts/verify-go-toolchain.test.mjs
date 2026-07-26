import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const verifierPath = fileURLToPath(
  new URL("./verify-go-toolchain.mjs", import.meta.url),
);

test("accepts setup-go steps after a major action upgrade", async (context) => {
  // Given
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wootty-go-toolchain-"));
  context.after(() => fs.rm(repoRoot, { force: true, recursive: true }));

  await Promise.all([
    fs.mkdir(path.join(repoRoot, ".github", "workflows"), { recursive: true }),
    fs.mkdir(path.join(repoRoot, "apps", "server"), { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(
      path.join(repoRoot, ".github", "workflows", "ci.yml"),
      `jobs:
  quality:
    steps:
      - name: Setup Go
        uses: actions/setup-go@v7
        with:
          go-version-file: apps/server/go.mod
          cache-dependency-path: apps/server/go.sum
`,
    ),
    fs.writeFile(
      path.join(repoRoot, "apps", "server", "go.mod"),
      "module example.com/wootty\n\ngo 1.26.5\n",
    ),
    fs.writeFile(
      path.join(repoRoot, "Dockerfile"),
      "FROM golang:1.26.5-bookworm AS server-builder\n",
    ),
  ]);

  // When
  const result = await execFileAsync(process.execPath, [verifierPath], {
    cwd: repoRoot,
  });

  // Then
  assert.match(result.stdout, /\(1 setup-go steps,/);
});
