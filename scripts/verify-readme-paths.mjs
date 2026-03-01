import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const readmePath = path.join(repoRoot, "README.md");
const readme = await fs.readFile(readmePath, "utf8");

const pathCandidates = new Set();

let inFence = false;
for (const line of readme.split("\n")) {
  if (line.trimStart().startsWith("```")) {
    inFence = !inFence;
    continue;
  }
  if (inFence) {
    continue;
  }
  const inlinePaths = [...line.matchAll(/`(apps\/[^`]+)`/g)].map((m) => m[1]);
  for (const inlinePath of inlinePaths) {
    if (inlinePath.includes(" ")) {
      continue;
    }
    pathCandidates.add(inlinePath.replace(/\/\*$/, ""));
  }
}

const missingPaths = [];
for (const relativePath of pathCandidates) {
  const absolutePath = path.join(repoRoot, relativePath);
  try {
    await fs.access(absolutePath);
  } catch {
    missingPaths.push(relativePath);
  }
}

if (missingPaths.length > 0) {
  console.error("README path references missing from repository:");
  for (const relativePath of missingPaths.sort()) {
    console.error(`- ${relativePath}`);
  }
  process.exit(1);
}

console.log(`README path check passed (${pathCandidates.size} paths).`);
