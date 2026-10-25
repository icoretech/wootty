import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const documentPaths = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "apps/server/README.md",
  "docs/architecture.md",
  "docs/runtime.md",
  "docs/web-ui-spec.md",
  "docs/web-ui-traceability.md",
];
const missingPaths = [];
let checkedPaths = 0;

for (const documentPath of documentPaths) {
  const source = await fs.readFile(path.join(repoRoot, documentPath), "utf8");
  const pathCandidates = new Set();
  let inFence = false;
  for (const line of source.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    for (const match of line.matchAll(
      /`((?:apps|contracts|scripts|docs)\/[^`]+)`/g,
    )) {
      const candidate = match[1];
      if (!candidate.includes(" ")) {
        pathCandidates.add(
          path.resolve(repoRoot, candidate.replace(/\/\*$/, "")),
        );
      }
    }

    const localLinks = [
      ...line.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g),
      ...line.matchAll(/(?:src|href)="([^"]+)"/g),
    ];
    for (const match of localLinks) {
      const target = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) {
        continue;
      }
      const relativePath = decodeURIComponent(target.split(/[?#]/, 1)[0]);
      if (relativePath.length > 0) {
        pathCandidates.add(
          path.resolve(repoRoot, path.dirname(documentPath), relativePath),
        );
      }
    }
  }

  for (const absolutePath of pathCandidates) {
    try {
      await fs.access(absolutePath);
      checkedPaths += 1;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
      missingPaths.push(
        `${documentPath}: ${path.relative(repoRoot, absolutePath)}`,
      );
    }
  }
}

if (missingPaths.length > 0) {
  console.error("Documentation path references missing from repository:");
  for (const missingPath of missingPaths.sort()) {
    console.error(`- ${missingPath}`);
  }
  process.exit(1);
}

console.log(
  `Documentation path check passed (${checkedPaths} paths in ${documentPaths.length} documents).`,
);
