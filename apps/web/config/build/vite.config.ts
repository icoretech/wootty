import { readFileSync } from "node:fs";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const proxyProtocol = process.env.WOOTTY_DEV_PROXY_PROTOCOL ?? "http";
const proxyHost = process.env.WOOTTY_DEV_PROXY_HOST ?? "127.0.0.1";
const proxyPort = process.env.WOOTTY_DEV_PROXY_PORT ?? "8080";
const proxyTarget = `${proxyProtocol}://${proxyHost}:${proxyPort}`;

const { version: appVersion } = JSON.parse(
  readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: {
    proxy: {
      "/api": {
        target: proxyTarget,
        ws: true,
      },
    },
  },
});
