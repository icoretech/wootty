import { describe, expect, it } from "vitest";
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from "../../../../src/features/terminal/preferences/font-size-policy";
import { readInitialFontSizeResult } from "../../../../src/features/terminal/app/preferences/font-size-preferences";
import { readTerminalTheme } from "../../../../src/features/terminal/runtime/terminal-theme";

describe("terminal-theme helpers", () => {
  it("clamps font size into the supported range", () => {
    expect(clampFontSize(FONT_SIZE_MIN - 5)).toBe(FONT_SIZE_MIN);
    expect(clampFontSize(FONT_SIZE_MAX + 5)).toBe(FONT_SIZE_MAX);
    expect(clampFontSize(14)).toBe(14);
  });

  it("reads initial font size safely from storage", () => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear() {
        values.clear();
      },
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      key(index: number) {
        return Array.from(values.keys())[index] ?? null;
      },
      removeItem(key: string) {
        values.delete(key);
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
    };

    expect(readInitialFontSizeResult(null).fontSize).toBe(DEFAULT_FONT_SIZE);
    expect(readInitialFontSizeResult(storage).fontSize).toBe(DEFAULT_FONT_SIZE);

    storage.setItem("wootty.fontSize", "19");
    expect(readInitialFontSizeResult(storage).fontSize).toBe(19);

    storage.setItem("wootty.fontSize", "999");
    expect(readInitialFontSizeResult(storage).fontSize).toBe(FONT_SIZE_MAX);

    storage.setItem("wootty.fontSize", "invalid");
    expect(readInitialFontSizeResult(storage).fontSize).toBe(DEFAULT_FONT_SIZE);

    storage.setItem("wootty.fontSize", "19px");
    expect(readInitialFontSizeResult(storage).fontSize).toBe(DEFAULT_FONT_SIZE);
  });

  it("returns fallback terminal theme colors without a document", () => {
    expect(readTerminalTheme(null)).toEqual({
      background: "transparent",
      foreground: "aliceblue",
      cursor: "gold",
      selectionBackground: "cadetblue",
      black: "black",
    });
  });
});
