import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const governancePath = path.join(
  repoRoot,
  "docs/governance/terminal-governance-map.json",
);
const readmePath = path.join(repoRoot, "README.md");
const traceabilityPath = path.join(repoRoot, "docs/web-ui-traceability.md");
const checkOnly = process.argv.includes("--check");

const governance = JSON.parse(await fs.readFile(governancePath, "utf8"));

function normalizeGovernancePath(value) {
  return value.replace(/\/\*$/, "");
}

function extractBacktickPaths(value) {
  return [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function isTraceabilityTestFile(linkedPath) {
  return (
    /\.(test|spec)\.[jt]sx?$/.test(linkedPath) || linkedPath.endsWith("_test.go")
  );
}

function hasExecutableTestPattern(linkedPath, source) {
  if (linkedPath.endsWith("_test.go")) {
    return /\bfunc\s+Test[A-Za-z0-9_]+\s*\(/.test(source);
  }
  return /\b(it|test)\s*\(/.test(source);
}

async function assertGovernancePathsExist() {
  const missing = [];
  const nonExecutableTests = [];

  for (const entry of governance.moduleOwnership) {
    const candidate = normalizeGovernancePath(entry.path);
    const absolutePath = path.join(repoRoot, candidate);
    try {
      await fs.access(absolutePath);
    } catch {
      missing.push(candidate);
    }
  }

  for (const entry of governance.traceability) {
    const linkedPaths = [
      ...extractBacktickPaths(entry.unitIntegration),
      ...extractBacktickPaths(entry.e2e),
    ].filter((value) => value.startsWith("apps/") || value.startsWith("docs/"));

    for (const linkedPath of linkedPaths) {
      const absolutePath = path.join(repoRoot, linkedPath);
      try {
        await fs.access(absolutePath);
        if (isTraceabilityTestFile(linkedPath)) {
          const source = await fs.readFile(absolutePath, "utf8");
          if (!hasExecutableTestPattern(linkedPath, source)) {
            nonExecutableTests.push(linkedPath);
          }
        }
      } catch {
        missing.push(linkedPath);
      }
    }
  }

  if (missing.length > 0) {
    const uniqueMissing = [...new Set(missing)].sort();
    for (const missingPath of uniqueMissing) {
      console.error(`Missing governance path: ${missingPath}`);
    }
    process.exit(1);
  }

  if (nonExecutableTests.length > 0) {
    const uniqueNonExecutable = [...new Set(nonExecutableTests)].sort();
    for (const testPath of uniqueNonExecutable) {
      console.error(
        `Governance traceability test has no executable test pattern: ${testPath}`,
      );
    }
    process.exit(1);
  }
}

const ownershipSection = governance.moduleOwnership
  .map((entry) => `- \`${entry.path}\`: ${entry.description}`)
  .join("\n");

const traceabilityRows = governance.traceability
  .map((entry) => {
    return `| ${entry.requirement} | ${entry.unitIntegration} | ${entry.e2e} |`;
  })
  .join("\n");

const traceabilityContent = [
  "# WooTTY Web UI Traceability Matrix",
  "",
  "This matrix ties each web UI functional requirement to concrete automated checks.",
  "",
  "| Requirement | Unit/Integration tests | E2E tests |",
  "| --- | --- | --- |",
  traceabilityRows,
  "",
  "## Runtime health lane",
  "",
  ...governance.runtimeHealthLane.map((line) => `- ${line}`),
  "",
].join("\n");

await assertGovernancePathsExist();

const readmeSource = await fs.readFile(readmePath, "utf8");
const startMarker = "<!-- governance:module-ownership:start -->";
const endMarker = "<!-- governance:module-ownership:end -->";
const startIndex = readmeSource.indexOf(startMarker);
const endIndex = readmeSource.indexOf(endMarker);
if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
  throw new Error("README governance ownership markers are missing or invalid.");
}

const replacementBlock = [
  startMarker,
  ownershipSection,
  endMarker,
].join("\n");
const readmeNext =
  readmeSource.slice(0, startIndex) +
  replacementBlock +
  readmeSource.slice(endIndex + endMarker.length);

if (checkOnly) {
  const currentTraceability = await fs.readFile(traceabilityPath, "utf8");
  const readmeChanged = readmeNext !== readmeSource;
  const traceabilityChanged = traceabilityContent !== currentTraceability;
  if (readmeChanged || traceabilityChanged) {
    if (readmeChanged) {
      console.error("README.md is out of date with governance map.");
    }
    if (traceabilityChanged) {
      console.error("docs/web-ui-traceability.md is out of date with governance map.");
    }
    process.exit(1);
  }
  console.log("Governance docs are up to date.");
  process.exit(0);
}

await fs.writeFile(readmePath, readmeNext);
await fs.writeFile(traceabilityPath, traceabilityContent);
console.log("Governance docs regenerated from docs/governance/terminal-governance-map.json.");
