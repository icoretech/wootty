import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function assertCompleteReactReport(report) {
  if (
    report?.schemaVersion !== 3 ||
    report.ok !== true ||
    report.mode !== "full" ||
    report.reactDetected !== true ||
    !Array.isArray(report.projects) ||
    report.projects.length === 0 ||
    !Array.isArray(report.diagnostics)
  ) {
    throw new Error("React Doctor did not return a valid full-project report");
  }
  for (const project of report.projects) {
    if (
      project.complete !== true ||
      !Array.isArray(project.skippedChecks) ||
      project.skippedChecks.length > 0 ||
      !(project.analyzedFileCount > 0) ||
      project.project?.hasReactCompiler !== true
    ) {
      throw new Error(
        "React Doctor analysis was incomplete or missed React Compiler",
      );
    }
  }
  if (report.diagnostics.length > 0) {
    throw new Error(
      `React Doctor reported ${report.diagnostics.length} diagnostics`,
    );
  }
}

function main() {
  const scan = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          "../node_modules/react-doctor/bin/react-doctor.js",
          import.meta.url,
        ),
      ),
      "apps/web",
      "--scope",
      "full",
      "--no-score",
      "--no-supply-chain",
      "--blocking",
      "warning",
      "--yes",
      "--json",
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (scan.stderr) process.stderr.write(scan.stderr);
  if (scan.error) throw scan.error;
  const report = JSON.parse(scan.stdout);
  for (const diagnostic of report.diagnostics ?? []) {
    console.error(
      `${diagnostic.filePath}:${diagnostic.line} ${diagnostic.severity} ${diagnostic.plugin}/${diagnostic.rule}: ${diagnostic.message}`,
    );
  }
  assertCompleteReactReport(report);
  if (scan.status !== 0)
    throw new Error(`React Doctor exited with status ${scan.status}`);
  const files = report.projects.reduce(
    (total, project) => total + project.analyzedFileCount,
    0,
  );
  console.log(
    `React Doctor: ${files} files, React Compiler detected, zero errors or warnings`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
