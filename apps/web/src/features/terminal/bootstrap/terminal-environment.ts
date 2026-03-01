import type {
  TerminalAppEnvironment,
  TerminalDomainEnvironment,
  TerminalPlatformEnvironment,
} from "../environment/terminal-environment-contract";
import { createBrowserTransport } from "../orchestration/browser-transport";
import { browserScheduler } from "../platform/scheduler";
import {
  type AuthTokenProvider,
  createBrowserAuthTokenProvider,
} from "./auth-token-provider";
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

function createPlatformEnvironment(
  authTokenProvider: AuthTokenProvider,
  envSocketUrl?: string,
): TerminalPlatformEnvironment {
  const windowRef = readWindow();
  return {
    documentRef: readDocument(),
    windowRef,
    scheduler: browserScheduler,
    resolveBackendEndpoints: (targetWindowRef) => {
      return resolveBrowserBackendEndpoints(targetWindowRef, envSocketUrl);
    },
    fetchSessionsPayload: createBrowserSessionsClient(authTokenProvider),
  };
}

export function createTerminalAppEnvironment(
  options: TerminalEnvironmentOptions = {},
): TerminalAppEnvironment {
  const envSocketUrl = resolveConfiguredSocketUrl(options);
  const authTokenProvider = createBrowserAuthTokenProvider(envSocketUrl);
  const platform = envSocketUrl
    ? createPlatformEnvironment(authTokenProvider, envSocketUrl)
    : createPlatformEnvironment(authTokenProvider);
  const loadRuntime = createRuntimeLoader();
  const domain: TerminalDomainEnvironment = {
    createTransport: createBrowserTransport,
    loadRuntime,
    getLocalStorage: () => readStorageResult("localStorage"),
    getSessionStorage: () => readStorageResult("sessionStorage"),
  };
  const environment: TerminalAppEnvironment = {
    platform,
    domain,
  };
  return environment;
}
