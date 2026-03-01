export const FONT_SIZE_MIN = 11;
export const FONT_SIZE_MAX = 22;
export const DEFAULT_FONT_SIZE = FONT_SIZE_MIN;

export function clampFontSize(value: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, value));
}
