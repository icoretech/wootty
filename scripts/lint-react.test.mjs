import assert from "node:assert/strict";
import test from "node:test";
import { assertCompleteReactReport } from "./lint-react.mjs";

function completeReport() {
  return {
    schemaVersion: 3,
    ok: true,
    mode: "full",
    reactDetected: true,
    diagnostics: [],
    projects: [
      {
        complete: true,
        skippedChecks: [],
        analyzedFileCount: 10,
        project: { hasReactCompiler: true },
      },
    ],
  };
}

test("accepts complete compiler-aware zero-diagnostic analysis", () => {
  assert.doesNotThrow(() => assertCompleteReactReport(completeReport()));
});

test("rejects warning diagnostics even when upstream marks a report successful", () => {
  const report = completeReport();
  report.diagnostics.push({ severity: "warning" });
  assert.throws(
    () => assertCompleteReactReport(report),
    /reported 1 diagnostics/,
  );
});

test("rejects skipped checks and incomplete analyses", () => {
  for (const project of [
    { complete: false, skippedChecks: [] },
    { complete: true, skippedChecks: ["lint"] },
    { complete: true, skippedChecks: [], analyzedFileCount: 0 },
    { complete: true, skippedChecks: [], project: { hasReactCompiler: false } },
  ]) {
    const report = completeReport();
    report.projects[0] = { ...report.projects[0], ...project };
    assert.throws(() => assertCompleteReactReport(report), /incomplete|missed/);
  }
});

test("rejects missing projects and non-full scope", () => {
  for (const patch of [{ projects: [] }, { mode: "changed" }, { ok: false }]) {
    assert.throws(
      () => assertCompleteReactReport({ ...completeReport(), ...patch }),
      /valid full-project/,
    );
  }
});
