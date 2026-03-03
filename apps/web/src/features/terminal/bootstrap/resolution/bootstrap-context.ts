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

/**
 * Extract auth token from a URL search params string.
 * Consolidated function for token extraction from various sources.
 */
function extractTokenFromSearchParams(
  searchParams: string | URLSearchParams,
): string | undefined {
  const params =
    typeof searchParams === "string"
      ? new URLSearchParams(searchParams)
      : searchParams;
  return normalizeAuthToken(params.get("token"));
}

export function readAuthTokenFromWindow(
  windowRef: Window | null,
): string | undefined {
  if (!windowRef) {
    return undefined;
  }
  return extractTokenFromSearchParams(windowRef.location.search);
}

export function readAuthTokenFromUrlResult(
  rawUrl: string,
): AuthTokenResolution {
  try {
    const parsed = new URL(rawUrl);
    return {
      token: extractTokenFromSearchParams(parsed.searchParams),
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
