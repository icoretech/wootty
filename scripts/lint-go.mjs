import { spawnSync } from "node:child_process";

const checkOnly = process.argv.includes("--check");
const options = { cwd: "apps/server", encoding: "utf8" };
const fix = spawnSync(
  "go",
  ["fix", ...(checkOnly ? ["-diff"] : []), "./..."],
  options,
);
process.stdout.write(fix.stdout ?? "");
process.stderr.write(fix.stderr ?? "");
if (fix.error) throw fix.error;
if (fix.status !== 0 || (checkOnly && fix.stdout.trim() !== "")) {
  process.exit(fix.status || 1);
}
const format = spawnSync("gofmt", [checkOnly ? "-l" : "-w", "."], options);
process.stdout.write(format.stdout ?? "");
process.stderr.write(format.stderr ?? "");
if (format.error) throw format.error;
if (format.status !== 0 || (checkOnly && format.stdout.trim() !== "")) {
  process.exit(format.status || 1);
}
const vet = spawnSync("go", ["vet", "./..."], { ...options, stdio: "inherit" });
if (vet.error) throw vet.error;
process.exit(vet.status ?? 1);
