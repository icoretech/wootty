import { build, loadConfigFromFile } from "vite";
import { describe, expect, it } from "vitest";

describe("production React compilation", () => {
  it("transforms a component through the actual Vite compiler configuration", async () => {
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "production" },
      "vite.config.ts",
    );
    if (!loaded) throw new Error("Expected the project Vite configuration");
    const config = loaded.config;
    const fixtureId = "/react-compiler-contract.tsx";
    const result = await build({
      ...config,
      configFile: false,
      logLevel: "silent",
      plugins: [
        config.plugins,
        {
          name: "compiler-contract-fixture",
          resolveId(id) {
            return id === fixtureId ? id : null;
          },
          load(id) {
            return id === fixtureId
              ? "export function Greeting({ name }: { name: string }) { return <p>{name}</p>; }"
              : null;
          },
        },
      ],
      build: {
        write: false,
        minify: false,
        lib: { entry: fixtureId, formats: ["es"] },
        rollupOptions: {
          external: ["react", "react/jsx-runtime", "react/compiler-runtime"],
        },
      },
    });
    if (!("output" in result) && !Array.isArray(result)) {
      throw new Error("Expected an in-memory production bundle");
    }
    const bundles = Array.isArray(result) ? result : [result];
    const code = bundles.flatMap((bundle) =>
      bundle.output.filter((output) => output.type === "chunk"),
    );

    expect(
      code.some((chunk) => chunk.imports.includes("react/compiler-runtime")),
    ).toBe(true);
  });
});
