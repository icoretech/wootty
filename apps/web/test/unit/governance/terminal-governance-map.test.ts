import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type GovernanceMap = {
  moduleOwnership: Array<{
    path: string;
    description: string;
  }>;
  traceability: Array<{
    requirement: string;
    unitIntegration: string;
    e2e: string;
  }>;
};

type TraceabilityAssertionManifest = {
  requirements: Array<{
    id: string;
    assertions: Array<{
      lane: "unitIntegration" | "e2e";
      path: string;
      contains: string;
    }>;
  }>;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

const governancePath = path.join(
  repoRoot,
  "docs/governance/terminal-governance-map.json",
);
const readmePath = path.join(repoRoot, "README.md");
const traceabilityAssertionsPath = path.join(
  repoRoot,
  "docs/governance/terminal-traceability-assertions.json",
);

function normalizeGovernancePath(value: string): string {
  return value.replace(/\/\*$/, "");
}

function extractBacktickPaths(value: string): string[] {
  return [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function isTraceabilityTestFile(linkedPath: string): boolean {
  return (
    /\.(test|spec)\.[jt]sx?$/.test(linkedPath) ||
    linkedPath.endsWith("_test.go")
  );
}

function hasExecutableTestPattern(linkedPath: string, source: string): boolean {
  if (linkedPath.endsWith("_test.go")) {
    return /\bfunc\s+Test[A-Za-z0-9_]+\s*\(/.test(source);
  }
  return /\b(it|test)\s*\(/.test(source);
}

function requirementIdFromLabel(label: string): string | null {
  const match = /^FR-\d+\b/.exec(label);
  return match ? match[0] : null;
}

async function readGovernanceMap(): Promise<GovernanceMap> {
  const source = await fs.readFile(governancePath, "utf8");
  return JSON.parse(source) as GovernanceMap;
}

async function readTraceabilityAssertions(): Promise<TraceabilityAssertionManifest> {
  const source = await fs.readFile(traceabilityAssertionsPath, "utf8");
  return JSON.parse(source) as TraceabilityAssertionManifest;
}

describe("terminal governance map", () => {
  it("keeps ownership and traceability paths resolvable", async () => {
    const governance = await readGovernanceMap();

    for (const entry of governance.moduleOwnership) {
      const candidate = normalizeGovernancePath(entry.path);
      const absolutePath = path.join(repoRoot, candidate);
      await expect(fs.access(absolutePath)).resolves.toBeUndefined();
    }

    for (const entry of governance.traceability) {
      const linkedPaths = [
        ...extractBacktickPaths(entry.unitIntegration),
        ...extractBacktickPaths(entry.e2e),
      ].filter(
        (value) => value.startsWith("apps/") || value.startsWith("docs/"),
      );

      for (const linkedPath of linkedPaths) {
        const absolutePath = path.join(repoRoot, linkedPath);
        await expect(fs.access(absolutePath)).resolves.toBeUndefined();
        if (isTraceabilityTestFile(linkedPath)) {
          const source = await fs.readFile(absolutePath, "utf8");
          expect(hasExecutableTestPattern(linkedPath, source)).toBe(true);
        }
      }
    }
  });

  it("keeps README ownership block generated from governance map", async () => {
    const governance = await readGovernanceMap();
    const readmeSource = await fs.readFile(readmePath, "utf8");
    const startMarker = "<!-- governance:module-ownership:start -->";
    const endMarker = "<!-- governance:module-ownership:end -->";
    const startIndex = readmeSource.indexOf(startMarker);
    const endIndex = readmeSource.indexOf(endMarker);

    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(startIndex);

    const ownershipSection = governance.moduleOwnership
      .map((entry) => `- \`${entry.path}\`: ${entry.description}`)
      .join("\n");
    const expectedBlock = [startMarker, ownershipSection, endMarker].join("\n");
    const actualBlock = readmeSource.slice(
      startIndex,
      endIndex + endMarker.length,
    );

    expect(actualBlock).toBe(expectedBlock);
  });

  it("keeps requirement-to-test assertions executable and semantically anchored", async () => {
    const governance = await readGovernanceMap();
    const assertions = await readTraceabilityAssertions();
    const sourceByPath = new Map<string, string>();

    const mapRequirementIds = new Set(
      governance.traceability
        .map((entry) => requirementIdFromLabel(entry.requirement))
        .filter((value): value is string => value !== null),
    );
    const assertionRequirementIds = new Set(
      assertions.requirements.map((entry) => entry.id),
    );

    expect(assertionRequirementIds).toEqual(mapRequirementIds);

    for (const requirement of assertions.requirements) {
      const coveredLanes = new Set<string>();
      for (const assertion of requirement.assertions) {
        coveredLanes.add(assertion.lane);
        const absolutePath = path.join(repoRoot, assertion.path);
        await expect(fs.access(absolutePath)).resolves.toBeUndefined();

        let source = sourceByPath.get(assertion.path);
        if (!source) {
          source = await fs.readFile(absolutePath, "utf8");
          sourceByPath.set(assertion.path, source);
        }

        if (isTraceabilityTestFile(assertion.path)) {
          expect(hasExecutableTestPattern(assertion.path, source)).toBe(true);
        }
        expect(source.includes(assertion.contains)).toBe(true);
      }

      expect(coveredLanes.has("unitIntegration")).toBe(true);
      expect(coveredLanes.has("e2e")).toBe(true);
    }
  });
});
