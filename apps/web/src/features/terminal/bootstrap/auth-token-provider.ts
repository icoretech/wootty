import { readWindow } from "./browser-environment-access";
import {
  type AuthTokenResolution,
  resolveBrowserAuthToken,
} from "./resolution/bootstrap-context";

export type { AuthTokenResolution };

export type AuthTokenProvider = () => AuthTokenResolution;

export function createBrowserAuthTokenProvider(
  envSocketUrl?: string,
): AuthTokenProvider {
  return () => {
    return resolveBrowserAuthToken(readWindow(), envSocketUrl);
  };
}
