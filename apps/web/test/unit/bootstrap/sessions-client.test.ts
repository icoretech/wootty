import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserSessionsClient } from "../../../src/features/terminal/bootstrap/sessions-client";

const SESSIONS_ENDPOINT = "/api/sessions";

describe("sessions client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses cookie credentials and parses successful JSON payloads", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        text: async () => JSON.stringify({ sessions: [] }),
      } as const;
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createBrowserSessionsClient();
    const result = await client(SESSIONS_ENDPOINT);

    expect(result).toEqual({
      ok: true,
      payload: { sessions: [] },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      SESSIONS_ENDPOINT,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
  });

  it("maps failure scenarios into typed fetch failures", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "{bad-json",
      })
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const client = createBrowserSessionsClient();

    await expect(client(SESSIONS_ENDPOINT)).resolves.toEqual({
      ok: false,
      failure: {
        source: "fetch",
        reason: "http_error",
        status: 503,
      },
    });
    await expect(client(SESSIONS_ENDPOINT)).resolves.toMatchObject({
      ok: false,
      failure: {
        source: "fetch",
        reason: "json_parse_error",
      },
    });
    await expect(client(SESSIONS_ENDPOINT)).resolves.toEqual({
      ok: false,
      failure: {
        source: "lifecycle",
        reason: "request_aborted",
      },
    });
    await expect(client(SESSIONS_ENDPOINT)).resolves.toMatchObject({
      ok: false,
      failure: {
        source: "fetch",
        reason: "network_error",
      },
    });
  });

  it("maps empty successful payloads to an empty sessions envelope", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        text: async () => "   ",
      } as const;
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createBrowserSessionsClient();
    const result = await client(SESSIONS_ENDPOINT);

    expect(result).toEqual({
      ok: true,
      payload: {
        sessions: [],
      },
    });
  });

  it("does not send bearer auth headers", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        text: async () => JSON.stringify({ sessions: [] }),
      } as const;
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createBrowserSessionsClient();
    await client(SESSIONS_ENDPOINT);

    expect(fetchMock).toHaveBeenCalledWith(
      SESSIONS_ENDPOINT,
      expect.objectContaining({
        headers: {
          Accept: "application/json",
        },
      }),
    );
  });
});
