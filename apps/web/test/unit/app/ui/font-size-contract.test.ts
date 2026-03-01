import { describe, expect, it } from "vitest";
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from "../../../../src/features/terminal/app/preferences/font-size-contract";

describe("font size contract", () => {
  it("re-exports stable font size bounds", () => {
    expect(DEFAULT_FONT_SIZE).toBeGreaterThanOrEqual(FONT_SIZE_MIN);
    expect(DEFAULT_FONT_SIZE).toBeLessThanOrEqual(FONT_SIZE_MAX);
  });

  it("clamps values to supported bounds", () => {
    expect(clampFontSize(FONT_SIZE_MIN - 10)).toBe(FONT_SIZE_MIN);
    expect(clampFontSize(FONT_SIZE_MAX + 10)).toBe(FONT_SIZE_MAX);
    expect(clampFontSize(DEFAULT_FONT_SIZE)).toBe(DEFAULT_FONT_SIZE);
  });
});
