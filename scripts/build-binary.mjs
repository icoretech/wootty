import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(repoRoot, process.argv[2] ?? "apps/server/woottyd");
const staging = mkdtempSync(resolve(tmpdir(), "wootty-build-"));
try {
  cpSync(resolve(repoRoot, "apps/server"), staging, {
    recursive: true,
    filter: (source) => source !== resolve(repoRoot, "apps/server/woottyd"),
  });
  rmSync(resolve(staging, "internal/webassets/dist"), {
    recursive: true,
    force: true,
  });
  cpSync(
    resolve(repoRoot, "apps/web/dist"),
    resolve(staging, "internal/webassets/dist"),
    {
      recursive: true,
    },
  );
  execFileSync(
    "go",
    ["build", "-trimpath", "-ldflags=-s -w", "-o", output, "./cmd/woottyd"],
    {
      cwd: staging,
      env: { ...process.env, CGO_ENABLED: "0" },
      stdio: "inherit",
    },
  );
} finally {
  rmSync(staging, { recursive: true, force: true });
}
