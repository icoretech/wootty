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

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

const governancePath = path.join(
  repoRoot,
  "docs/governance/terminal-governance-map.json",
);
const readmePath = path.join(repoRoot, "README.md");

function normalizeGovernancePath(value: string): string {
  return value.replace(/\/\*$/, "");
}

function extractBacktickPaths(value: string): string[] {
  return [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

async function readGovernanceMap(): Promise<GovernanceMap> {
  const source = await fs.readFile(governancePath, "utf8");
  return JSON.parse(source) as GovernanceMap;
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
});
