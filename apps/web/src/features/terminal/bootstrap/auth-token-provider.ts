import { resolveSocketUrl } from "./backend-endpoint-resolver";
import { readWindow } from "./browser-environment-access";

export type AuthTokenResolution = {
  token: string | undefined;
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
  try {
    const parsed = new URL(rawUrl);
    return normalizeAuthToken(parsed.searchParams.get("token"));
  } catch {
    return undefined;
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
      };
    }
    return {
      token: readAuthTokenFromUrl(socketResolution.socketUrl),
    };
  };
}
