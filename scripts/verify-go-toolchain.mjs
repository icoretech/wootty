import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const workflowsDir = path.join(repoRoot, ".github", "workflows");
const goModPath = path.join(repoRoot, "apps", "server", "go.mod");
const dockerfilePath = path.join(repoRoot, "Dockerfile");
const goVersionFile = "apps/server/go.mod";
const goCachePath = "apps/server/go.sum";
const setupGoAction = "uses: actions/setup-go@";

const goMod = await fs.readFile(goModPath, "utf8");
const goDirectiveMatch = /^go\s+(?<version>\d+\.\d+(?:\.\d+)?)$/m.exec(goMod);
if (!goDirectiveMatch?.groups?.version) {
  console.error(`Could not read Go directive from ${goVersionFile}`);
  process.exit(1);
}
const goVersion = goDirectiveMatch.groups.version;

const failures = [];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function leadingSpaces(line) {
  return line.match(/^ */)?.[0].length ?? 0;
}

function setupGoStep(lines, usesLineIndex) {
  const usesIndent = leadingSpaces(lines[usesLineIndex]);

  for (let index = usesLineIndex; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.trim().startsWith("- ") && leadingSpaces(line) <= usesIndent) {
      return { index, indent: leadingSpaces(line) };
    }
  }

  return { index: usesLineIndex, indent: Math.max(0, usesIndent - 2) };
}

function setupGoBlock(lines, usesLineIndex) {
  const step = setupGoStep(lines, usesLineIndex);
  const block = [];

  for (let index = step.index; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      index > step.index &&
      line.trim().startsWith("- ") &&
      leadingSpaces(line) <= step.indent
    ) {
      break;
    }
    block.push(line);
  }

  return block.join("\n");
}

const workflowFiles = (await fs.readdir(workflowsDir))
  .filter((fileName) => /\.ya?ml$/.test(fileName))
  .sort();
let setupGoSteps = 0;

for (const fileName of workflowFiles) {
  const relativePath = path.join(".github", "workflows", fileName);
  const content = await fs.readFile(path.join(repoRoot, relativePath), "utf8");
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    if (!line.includes(setupGoAction)) {
      return;
    }

    setupGoSteps += 1;
    const block = setupGoBlock(lines, index);
    const location = `${relativePath}:${index + 1}`;

    if (/^\s*go-version\s*:/m.test(block)) {
      failures.push(
        `${location} hard-codes go-version; use go-version-file: ${goVersionFile}`,
      );
    }

    if (
      !new RegExp(`^\\s*go-version-file:\\s*${escapeRegExp(goVersionFile)}$`, "m").test(
        block,
      )
    ) {
      failures.push(`${location} must read Go from ${goVersionFile}`);
    }

    if (
      !new RegExp(`^\\s*cache-dependency-path:\\s*${escapeRegExp(goCachePath)}$`, "m").test(
        block,
      )
    ) {
      failures.push(`${location} must cache modules from ${goCachePath}`);
    }
  });
}

if (setupGoSteps === 0) {
  failures.push("No actions/setup-go steps found in GitHub workflows");
}

const dockerfile = await fs.readFile(dockerfilePath, "utf8");
const goImageLines = dockerfile
  .split("\n")
  .filter((line) => /^FROM\s+golang:/i.test(line));
const expectedGoImageLine = `FROM golang:${goVersion}-bookworm AS server-builder`;

if (goImageLines.length === 0) {
  failures.push("Dockerfile does not declare a golang server-builder image");
}

for (const line of goImageLines) {
  if (line !== expectedGoImageLine) {
    failures.push(
      `Dockerfile Go builder must match ${goVersionFile}: expected ${expectedGoImageLine}, got ${line}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Go toolchain invariants failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Go toolchain check passed (${setupGoSteps} setup-go steps, golang:${goVersion}-bookworm).`,
);
