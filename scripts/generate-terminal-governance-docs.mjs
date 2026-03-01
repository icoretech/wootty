import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const governancePath = path.join(
  repoRoot,
  "docs/governance/terminal-governance-map.json",
);
const readmePath = path.join(repoRoot, "README.md");
const traceabilityPath = path.join(repoRoot, "docs/web-ui-traceability.md");
const traceabilityAssertionsPath = path.join(
  repoRoot,
  "docs/governance/terminal-traceability-assertions.json",
);
const checkOnly = process.argv.includes("--check");

const governance = JSON.parse(await fs.readFile(governancePath, "utf8"));
const traceabilityAssertions = JSON.parse(
  await fs.readFile(traceabilityAssertionsPath, "utf8"),
);

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

function requirementIdFromLabel(requirementLabel) {
  const match = /^FR-\d+\b/.exec(requirementLabel);
  return match ? match[0] : null;
}

async function assertGovernancePathsExist() {
  const missing = [];
  const nonExecutableTests = [];
  const semanticTraceabilityFailures = [];
  const traceabilityLaneFailures = [];
  const traceabilityIdFailures = [];
  const sourceByPath = new Map();

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
          const source =
            sourceByPath.get(linkedPath) ??
            (await fs.readFile(absolutePath, "utf8"));
          sourceByPath.set(linkedPath, source);
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

  const requirementIdsFromMap = new Set();
  for (const entry of governance.traceability) {
    const requirementId = requirementIdFromLabel(entry.requirement);
    if (!requirementId) {
      traceabilityIdFailures.push(
        `Traceability requirement is missing FR-* prefix: ${entry.requirement}`,
      );
      continue;
    }
    requirementIdsFromMap.add(requirementId);
  }

  const requirementIdsFromAssertions = new Set(
    traceabilityAssertions.requirements.map((entry) => entry.id),
  );
  for (const requirementId of requirementIdsFromMap) {
    if (!requirementIdsFromAssertions.has(requirementId)) {
      traceabilityIdFailures.push(
        `No assertions defined for governance requirement ${requirementId}`,
      );
    }
  }
  for (const requirementId of requirementIdsFromAssertions) {
    if (!requirementIdsFromMap.has(requirementId)) {
      traceabilityIdFailures.push(
        `Assertion manifest requirement ${requirementId} is not present in governance map`,
      );
    }
  }

  for (const requirement of traceabilityAssertions.requirements) {
    const coveredLanes = new Set();
    for (const assertion of requirement.assertions) {
      coveredLanes.add(assertion.lane);
      const traceId =
        typeof assertion.traceId === "string" ? assertion.traceId : null;
      if (!traceId || traceId.trim().length === 0) {
        semanticTraceabilityFailures.push(
          `${requirement.id}: assertion is missing a stable traceId in ${assertion.path}`,
        );
        continue;
      }
      const absolutePath = path.join(repoRoot, assertion.path);
      try {
        await fs.access(absolutePath);
      } catch {
        semanticTraceabilityFailures.push(
          `${requirement.id}: missing assertion path ${assertion.path}`,
        );
        continue;
      }
      const source =
        sourceByPath.get(assertion.path) ??
        (await fs.readFile(absolutePath, "utf8"));
      sourceByPath.set(assertion.path, source);

      if (
        isTraceabilityTestFile(assertion.path) &&
        !hasExecutableTestPattern(assertion.path, source)
      ) {
        semanticTraceabilityFailures.push(
          `${requirement.id}: assertion path has no executable tests ${assertion.path}`,
        );
      }
      if (!source.includes(traceId)) {
        semanticTraceabilityFailures.push(
          `${requirement.id}: traceId not found in ${assertion.path}: ${traceId}`,
        );
      }
    }

    if (!coveredLanes.has("unitIntegration")) {
      traceabilityLaneFailures.push(
        `${requirement.id}: missing unitIntegration assertion lane`,
      );
    }
    if (!coveredLanes.has("e2e")) {
      traceabilityLaneFailures.push(
        `${requirement.id}: missing e2e assertion lane`,
      );
    }
  }

  if (traceabilityIdFailures.length > 0) {
    for (const failure of traceabilityIdFailures) {
      console.error(`Governance traceability id mismatch: ${failure}`);
    }
    process.exit(1);
  }

  if (traceabilityLaneFailures.length > 0) {
    for (const failure of traceabilityLaneFailures) {
      console.error(`Governance traceability lane mismatch: ${failure}`);
    }
    process.exit(1);
  }

  if (semanticTraceabilityFailures.length > 0) {
    for (const failure of semanticTraceabilityFailures) {
      console.error(`Governance traceability assertion failed: ${failure}`);
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
