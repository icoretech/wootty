import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const proxyProtocol = process.env.WOOTTY_DEV_PROXY_PROTOCOL ?? "http";
const proxyHost = process.env.WOOTTY_DEV_PROXY_HOST ?? "127.0.0.1";
const proxyPort = process.env.WOOTTY_DEV_PROXY_PORT ?? "8080";
const proxyTarget = `${proxyProtocol}://${proxyHost}:${proxyPort}`;

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: proxyTarget,
        ws: true,
      },
    },
  },
});
