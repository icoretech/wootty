import { createBrowserTransport } from "../adapters/browser-transport";
import type { TerminalAppEnvironment } from "../environment/terminal-environment-contract";
import { browserScheduler } from "../platform/scheduler";
import { bootstrapBrowserAuth } from "./auth-bootstrap";
import {
  readDocument,
  readStorageResult,
  readWindow,
} from "./browser-environment-access";
import { resolveBrowserBackendEndpoints } from "./resolution/bootstrap-context";
import { createRuntimeLoader } from "./runtime-loader";
import { createBrowserSessionsClient } from "./sessions-client";

type TerminalEnvironmentOptions = {
  socketUrl?: string;
};

function resolveConfiguredSocketUrl(
  options: TerminalEnvironmentOptions,
): string | undefined {
  const candidate = options.socketUrl ?? import.meta.env.VITE_WOOTTY_WS_URL;
  if (typeof candidate !== "string") {
    return undefined;
  }
  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export const createTerminalAppEnvironment = (
  options: TerminalEnvironmentOptions = {},
): TerminalAppEnvironment => {
  const envSocketUrl = resolveConfiguredSocketUrl(options);
  const windowRef = readWindow();
  const loadRuntime = createRuntimeLoader();
  return {
    documentRef: readDocument(),
    windowRef,
    scheduler: browserScheduler,
    bootstrapAuth: () => bootstrapBrowserAuth(windowRef, envSocketUrl),
    resolveBackendEndpoints: (targetWindowRef) => {
      return resolveBrowserBackendEndpoints(targetWindowRef, envSocketUrl);
    },
    fetchSessionsPayload: createBrowserSessionsClient(),
    createTransport: createBrowserTransport,
    loadRuntime,
    getLocalStorage: () => readStorageResult("localStorage"),
    getSessionStorage: () => readStorageResult("sessionStorage"),
  };
};
