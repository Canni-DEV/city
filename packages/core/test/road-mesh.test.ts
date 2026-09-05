import { describe, expect, it } from "vitest";
import { keepSpacedAxes, MIN_STREET_GAP } from "../src/road-mesh.js";

describe("M3.6.1 local mesh spacing", () => {
  it("drops warped axes that would leave a manzana thinner than sidewalk+lot+sidewalk", () => {
    expect(MIN_STREET_GAP).toBe(4);
    expect(keepSpacedAxes([10, 12, 20], [])).toEqual([10, 20]);
    expect(keepSpacedAxes([8, 16, 24], [16])).toEqual([8, 24]);
  });
});
