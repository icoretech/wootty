import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapBrowserAuth,
  readAuthTokenFromWindowHash,
} from "../../../src/features/terminal/bootstrap/auth-bootstrap";

describe("auth bootstrap", () => {
  const originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", originalPath);
  });

  it("reads the auth token from the window hash only", () => {
    window.history.replaceState({}, "", "/#token=hash-token");
    expect(readAuthTokenFromWindowHash(window)).toBe("hash-token");

    window.history.replaceState({}, "", "/?token=query-token");
    expect(readAuthTokenFromWindowHash(window)).toBeUndefined();
  });

  it("posts the hash token to the auth bootstrap endpoint and strips it from the URL", async () => {
    window.history.replaceState({}, "", "/#token=hash-token&mode=watch");
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        status: 204,
      } as const;
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      bootstrapBrowserAuth(window, "wss://ws.example.test/api/terminal"),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ws.example.test/api/auth/bootstrap",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          Authorization: "Bearer hash-token",
        }),
      }),
    );
    expect(window.location.hash).toBe("#mode=watch");
  });

  it("skips bootstrap when no hash token is present", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      bootstrapBrowserAuth(window, "wss://ws.example.test/api/terminal"),
    ).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when auth bootstrap endpoint rejects the token", async () => {
    window.history.replaceState({}, "", "/#token=bad-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          ok: false,
          status: 401,
        } as const;
      }),
    );

    await expect(
      bootstrapBrowserAuth(window, "wss://ws.example.test/api/terminal"),
    ).rejects.toThrow("terminal auth bootstrap failed with status 401");
  });
});
