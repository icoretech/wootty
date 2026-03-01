import { describe, expect, it } from "vitest";
import {
  readDocument,
  readStorage,
  readWindow,
} from "../../../src/features/terminal/bootstrap/browser-environment-access";

describe("browser environment access", () => {
  it("reads window/document references when browser globals are present", () => {
    expect(readWindow()).toBe(window);
    expect(readDocument()).toBe(document);
  });

  it("reads local/session storage references", () => {
    expect(readStorage("localStorage")).toBe(window.localStorage);
    expect(readStorage("sessionStorage")).toBe(window.sessionStorage);
  });
});
