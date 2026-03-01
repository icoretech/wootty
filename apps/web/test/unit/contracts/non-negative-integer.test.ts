import { describe, expect, it } from "vitest";
import { parseNonNegativeInteger } from "../../../src/features/terminal/contracts/non-negative-integer";

describe("parseNonNegativeInteger", () => {
  it("returns numeric values for finite non-negative integers", () => {
    expect(parseNonNegativeInteger(0)).toBe(0);
    expect(parseNonNegativeInteger(17)).toBe(17);
  });

  it("returns null for negative, non-integer, and non-number values", () => {
    expect(parseNonNegativeInteger(-1)).toBeNull();
    expect(parseNonNegativeInteger(1.5)).toBeNull();
    expect(parseNonNegativeInteger(Number.NaN)).toBeNull();
    expect(parseNonNegativeInteger(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseNonNegativeInteger("1")).toBeNull();
  });
});
