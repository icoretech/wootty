import { vi } from "vitest";

export type SessionsResponseInit = {
  ok?: boolean;
  status?: number;
  sessions?: unknown[];
};

type FetchHarness = {
  readonly fetchMock: ReturnType<typeof vi.fn>;
  setFetchResponse: (init: SessionsResponseInit) => void;
  setFetchError: (error: Error) => void;
};

export function createFetchHarness(): FetchHarness {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ sessions: [] }),
  }));
  vi.stubGlobal("fetch", fetchMock);

  return {
    fetchMock,
    setFetchResponse: (init) => {
      fetchMock.mockResolvedValue({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: async () => ({ sessions: init.sessions ?? [] }),
      });
    },
    setFetchError: (error) => {
      fetchMock.mockRejectedValue(error);
    },
  };
}
