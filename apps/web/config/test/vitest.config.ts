import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "browser-unit",
          // Reuse jsdom imports while keeping a fresh VM and window per file.
          pool: "vmThreads",
          isolate: true,
          environment: "jsdom",
          include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
          exclude: ["test/config/**"],
          setupFiles: ["./test/support/test-setup.ts"],
        },
      },
      {
        test: {
          name: "tooling-contracts",
          // Rolldown native plugins and Playwright require the Node realm.
          pool: "forks",
          environment: "node",
          include: ["test/config/**/*.test.ts"],
        },
      },
    ],
  },
});
