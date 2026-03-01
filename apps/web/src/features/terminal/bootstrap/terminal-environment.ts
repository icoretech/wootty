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
import { resolveTerminalBackendEndpoints } from "./backend-endpoint-resolver";
import {
  readDocument,
  readStorage,
  readWindow,
} from "./browser-environment-access";
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
      const tokenResolution = authTokenProvider();
      if (tokenResolution.issue) {
        return {
          ok: false as const,
          issue: tokenResolution.issue,
        };
      }
      return resolveTerminalBackendEndpoints(
        targetWindowRef,
        envSocketUrl,
        tokenResolution.token,
      );
    },
    fetchSessionsPayload: createBrowserSessionsClient(authTokenProvider),
  };
}

export function createTerminalAppEnvironment(
  options: TerminalEnvironmentOptions = {},
): TerminalAppEnvironment {
  const envSocketUrl = resolveConfiguredSocketUrl(options);
  const authTokenProvider = createBrowserAuthTokenProvider(envSocketUrl);
  const platform = createPlatformEnvironment(authTokenProvider, envSocketUrl);
  const loadRuntime = createRuntimeLoader();
  const domain: TerminalDomainEnvironment = {
    createTransport: createBrowserTransport,
    loadRuntime,
    getLocalStorage: () => readStorage("localStorage"),
    getSessionStorage: () => readStorage("sessionStorage"),
  };
  const environment: TerminalAppEnvironment = {
    platform,
    domain,
  };
  return environment;
}
