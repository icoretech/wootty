import type { TerminalBackendResolutionIssue } from "../contracts/backend-resolution";
import { readWindow } from "./browser-environment-access";
import { redactTokenInUrlForNotice } from "./url/redact-token-in-url";
import { resolveSocketUrl } from "./url/socket-url-resolution";

export type AuthTokenResolution = {
  token: string | undefined;
  issue?: TerminalBackendResolutionIssue;
};

export type AuthTokenProvider = () => AuthTokenResolution;

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

export function readAuthTokenFromUrl(rawUrl: string): string | undefined {
  return readAuthTokenFromUrlResult(rawUrl).token;
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

export function createBrowserAuthTokenProvider(
  envSocketUrl?: string,
): AuthTokenProvider {
  return () => {
    const windowRef = readWindow();
    const fromWindow = readAuthTokenFromWindow(windowRef);
    if (fromWindow) {
      return { token: fromWindow };
    }

    const socketResolution = resolveSocketUrl(windowRef, envSocketUrl);
    if (!socketResolution.ok) {
      return {
        token: undefined,
        issue: socketResolution.issue,
      };
    }
    return readAuthTokenFromUrlResult(socketResolution.socketUrl);
  };
}
