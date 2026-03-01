import { FONT_SIZE_MAX, FONT_SIZE_MIN } from "../../contracts/font-size";

export {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from "../../contracts/font-size";

export function clampFontSize(value: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, value));
}
