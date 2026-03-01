import { readWindow } from "./browser-environment-access";
import {
  type AuthTokenResolution,
  normalizeAuthToken,
  readAuthTokenFromUrlResult,
  readAuthTokenFromWindow,
  resolveBrowserAuthToken,
} from "./resolution/bootstrap-context";

export {
  normalizeAuthToken,
  readAuthTokenFromUrlResult,
  readAuthTokenFromWindow,
};
export type { AuthTokenResolution };

export type AuthTokenProvider = () => AuthTokenResolution;

export function createBrowserAuthTokenProvider(
  envSocketUrl?: string,
): AuthTokenProvider {
  return () => {
    return resolveBrowserAuthToken(readWindow(), envSocketUrl);
  };
}
