import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

async function metadata(context, workflow, tag) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "wootty-release-"));
  context.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const yaml = await fs.readFile(
    new URL(`../.github/workflows/${workflow}.yml`, import.meta.url),
    "utf8",
  );
  const block = yaml.match(/ {8}run: \|\n([\s\S]+?)\n {6}- name: Checkout/);
  assert.ok(block);
  const script = block[1]
    .split("\n")
    .map((line) => line.slice(10))
    .join("\n");
  const output = path.join(cwd, "output");
  await run("bash", ["-c", script], {
    cwd,
    env: { ...process.env, INPUT_TAG: tag, GITHUB_OUTPUT: output },
  });
  return Object.fromEntries(
    (await fs.readFile(output, "utf8"))
      .trim()
      .split("\n")
      .map((line) => line.split("=")),
  );
}

for (const workflow of ["publish-binaries", "publish-image"]) {
  test(`${workflow} normalizes a stable version into a release ref`, async (context) => {
    // Given / When
    const result = await metadata(context, workflow, "v1.2.3");
    // Then
    assert.equal(result.checkout_ref, "refs/tags/wootty-v1.2.3");
    assert.equal(result.version_tag, "v1.2.3");
  });
  test(`${workflow} rejects arbitrary refs and multiline metadata`, async (context) => {
    // Given / When / Then
    await assert.rejects(
      metadata(context, workflow, "main\ncheckout_ref=main"),
    );
  });
}
test("prerelease container publishing does not overwrite latest", async (context) => {
  // Given / When
  const result = await metadata(context, "publish-image", "wootty-v1.0.0-rc.1");
  // Then
  assert.equal(result.publish_latest, "false");
  assert.equal(result.version_tag, "v1.0.0-rc.1");
});
