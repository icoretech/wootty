import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readDocument,
  readStorageResult,
  readWindow,
} from "../../../src/features/terminal/bootstrap/browser-environment-access";

describe("browser environment access", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads window/document references when browser globals are present", () => {
    expect(readWindow()).toBe(window);
    expect(readDocument()).toBe(document);
  });

  it("reads local/session storage references", () => {
    expect(readStorageResult("localStorage")).toEqual({
      storage: window.localStorage,
      error: null,
    });
    expect(readStorageResult("sessionStorage")).toEqual({
      storage: window.sessionStorage,
      error: null,
    });
  });

  it("returns structured failure when browser storage access throws", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("denied");
    });

    const result = readStorageResult("localStorage");
    expect(result.storage).toBeNull();
    expect(result.error).toMatchObject({
      operation: "read",
      key: "localStorage",
    });
  });
});
