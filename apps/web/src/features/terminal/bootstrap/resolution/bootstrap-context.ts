import type {
  TerminalBackendResolution,
  TerminalBackendResolutionIssue,
} from "../../contracts/backend-resolution";
import { redactTokenInUrlForNotice } from "../../shared/sanitization/redact-token-in-url";
import { resolveTerminalBackendEndpoints } from "../backend-endpoint-resolver";

export type AuthTokenResolution = {
  token: string | undefined;
  issue?: TerminalBackendResolutionIssue;
};

export function normalizeAuthToken(
  token: string | null | undefined,
): string | undefined {
  if (!token) {
    return undefined;
  }
  const normalized = token.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function readAuthTokenFromWindow(
  windowRef: Window | null,
): string | undefined {
  if (!windowRef) {
    return undefined;
  }
  return normalizeAuthToken(
    windowRef.location.search
      ? new URLSearchParams(windowRef.location.search).get("token")
      : null,
  );
}

export function readAuthTokenFromUrlResult(
  rawUrl: string,
): AuthTokenResolution {
  try {
    const parsed = new URL(rawUrl);
    return {
      token: normalizeAuthToken(parsed.searchParams.get("token")),
    };
  } catch {
    return {
      token: undefined,
      issue: {
        code: "socket_url_invalid_format",
        details: `unable to parse websocket URL while extracting auth token (${redactTokenInUrlForNotice(rawUrl)})`,
      },
    };
  }
}

export function resolveBrowserAuthToken(
  windowRef: Window | null,
  envSocketUrl?: string,
): AuthTokenResolution {
  const fromWindow = readAuthTokenFromWindow(windowRef);
  if (fromWindow) {
    return { token: fromWindow };
  }

  const backendResolution = resolveTerminalBackendEndpoints(
    windowRef,
    envSocketUrl,
  );
  if (!backendResolution.ok) {
    return {
      token: undefined,
      issue: backendResolution.issue,
    };
  }
  return readAuthTokenFromUrlResult(backendResolution.endpoints.terminalWsUrl);
}

export function resolveBrowserBackendEndpoints(
  windowRef: Window | null,
  envSocketUrl?: string,
): TerminalBackendResolution {
  return resolveTerminalBackendEndpoints(windowRef, envSocketUrl);
}
