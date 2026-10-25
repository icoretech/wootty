import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(
  new URL("./verify-readme-paths.mjs", import.meta.url),
);
const fixtures = [];

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((fixture) => fs.rm(fixture, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wootty-doc-paths-"));
  fixtures.push(root);
  for (const document of [
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "apps/server/README.md",
    "docs/architecture.md",
    "docs/runtime.md",
    "docs/web-ui-spec.md",
    "docs/web-ui-traceability.md",
  ]) {
    await fs.mkdir(path.dirname(path.join(root, document)), {
      recursive: true,
    });
    await fs.writeFile(path.join(root, document), "# Documentation\n");
  }
  return root;
}

function verify(root) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });
}

test("rejects a missing Markdown link in the README", async () => {
  const root = await createFixture();
  await fs.writeFile(
    path.join(root, "README.md"),
    "[Setup](docs/missing.md#setup)\n",
  );

  const result = verify(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md: docs\/missing\.md/);
});

test("resolves nested links and images relative to their document", async () => {
  const root = await createFixture();
  await fs.writeFile(
    path.join(root, "apps/server/README.md"),
    "[Runtime](../../docs/runtime.md#configuration)\n",
  );
  await fs.writeFile(path.join(root, "docs/logo.png"), "fixture");
  await fs.writeFile(
    path.join(root, "README.md"),
    '<img src="docs/logo.png">\n',
  );
  await fs.writeFile(
    path.join(root, "docs/runtime.md"),
    "![Logo](logo.png)\n[Home](../README.md)\n",
  );

  const result = verify(root);

  assert.equal(result.status, 0, result.stderr);
});

test("checks root-relative source paths in moved architecture documentation", async () => {
  const root = await createFixture();
  await fs.writeFile(
    path.join(root, "docs/architecture.md"),
    "Owner: `apps/server/missing.go`\n",
  );

  const result = verify(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /docs\/architecture\.md: apps\/server\/missing\.go/,
  );
});

test("ignores external links, page anchors, and illustrative fenced code", async () => {
  const root = await createFixture();
  await fs.writeFile(
    path.join(root, "README.md"),
    [
      "[Site](https://example.com/missing)",
      "[Mail](mailto:operator@example.com)",
      "[Section](#setup)",
      "```markdown",
      "[Example](missing.md)",
      "```",
    ].join("\n"),
  );

  const result = verify(root);

  assert.equal(result.status, 0, result.stderr);
});
