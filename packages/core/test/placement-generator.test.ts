import { describe, expect, it } from "vitest";
import {
  applyDistrictThemes,
  cellSpan,
  generateRoadCity,
  hashGeneratedStructure,
  occupiedCellsFor,
  occupiedRoadSet,
  PRESET_PARAMETERS,
  validatePlacedCity,
} from "../src/index.js";
import { TEST_ASSETS } from "./catalog-assets.js";

const input = {
  id: "city-m3",
  name: "M3 test",
  seed: "footprints",
  timestamp: "2026-09-05T00:00:00.000Z",
  parameters: { ...PRESET_PARAMETERS.balanced, size: 64 as const },
  assets: TEST_ASSETS,
};

describe("M3 placement", () => {
  it("GEN-009/GEN-022 never overlaps procedural occupancy or leaves the mask", async () => {
    const city = await generateRoadCity(input);
    const roads = occupiedRoadSet(city.roadGraph.cells);
    const occupied = new Set<string>();
    expect(Object.keys(city.entities).length).toBeGreaterThan(0);
    for (const entity of Object.values(city.entities)) {
      expect(entity.origin).toBe("procedural");
      expect(TEST_ASSETS.some((asset) => asset.id === entity.assetId)).toBe(true);
      for (const [x, y] of occupiedCellsFor(entity)) {
        const key = `${x},${y}`;
        expect(Number.isInteger(x)).toBe(true);
        expect(Number.isInteger(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(city.map.size);
        expect(y).toBeLessThan(city.map.size);
        expect(city.map.boundaryMask[y * city.map.size + x]).toBe(true);
        expect(roads.has(key)).toBe(false);
        expect(occupied.has(key)).toBe(false);
        occupied.add(key);
      }
    }
    expect(validatePlacedCity(city, TEST_ASSETS)).toEqual([]);
  }, 30_000);

  it("GEN-010 assigns district palettes from the selected color theme", async () => {
    for (const colorTheme of ["district", "warm", "cool"] as const) {
      const city = await generateRoadCity({
        ...input,
        parameters: { ...input.parameters, colorTheme },
      });
      applyDistrictThemes(city);
      expect(new Set(city.districts.map((district) => district.theme)).size).toBeGreaterThan(0);
      expect(city.districts.every((district) => district.theme.length > 0)).toBe(true);
      if (colorTheme === "warm") {
        expect(city.districts.some((district) => district.theme === "variation-a")).toBe(true);
      }
      if (colorTheme === "cool") {
        expect(city.districts.some((district) => district.theme === "variation-b")).toBe(true);
      }
    }
  }, 30_000);

  it("GEN-011/TST-003 rejects missing assets, overlaps, and out-of-mask entities", async () => {
    const city = await generateRoadCity(input);
    const first = Object.values(city.entities)[0];
    if (!first) throw new Error("generated city has no entities");
    const mutate = (edit: (copy: typeof city) => void, issue: string) => {
      const copy = structuredClone(city);
      edit(copy);
      expect(
        validatePlacedCity(copy, TEST_ASSETS).some((message) => message.includes(issue)),
        issue,
      ).toBe(true);
    };
    mutate((copy) => {
      const entity = Object.values(copy.entities)[0];
      if (entity) entity.assetId = "missing-asset";
    }, "missing asset");
    mutate((copy) => {
      const entity = Object.values(copy.entities)[0];
      if (entity) entity.districtId = "missing";
    }, "missing district");
    mutate((copy) => {
      const entity = Object.values(copy.entities)[0];
      if (entity) entity.transform.position = [-8, 0, -8];
    }, "leaves the valid mask");
    mutate((copy) => {
      copy.entities = {};
    }, "no entities");
    mutate((copy) => {
      const entity = Object.values(copy.entities)[0];
      const other = Object.values(copy.entities)[1];
      if (entity && other) copy.entities[other.id] = { ...entity, id: other.id };
    }, "overlapping procedural occupancy");
  }, 30_000);

  it("TST-001 includes placed entities in the canonical hash", async () => {
    const city = await generateRoadCity(input);
    const before = hashGeneratedStructure(city);
    const entity = Object.values(city.entities)[0];
    if (!entity) throw new Error("generated city has no entities");
    entity.transform.position = [
      entity.transform.position[0] ?? 0,
      entity.transform.position[1] ?? 0,
      (entity.transform.position[2] ?? 0) + 1,
    ];
    expect(hashGeneratedStructure(city)).not.toBe(before);
  }, 30_000);

  it("cell spans keep sub-cell Kenney footprints on one grid cell", () => {
    expect(cellSpan(0.88)).toBe(1);
    expect(cellSpan(1.3)).toBe(1);
    expect(cellSpan(1.64)).toBe(2);
    expect(cellSpan(2.08)).toBe(2);
  });

  it("AC-011 generates a 128×128 city with entities in Node", async () => {
    const city = await generateRoadCity({
      ...input,
      seed: "m3-budget-128",
      parameters: { ...PRESET_PARAMETERS.balanced, size: 128 },
    });
    expect(validatePlacedCity(city, TEST_ASSETS)).toEqual([]);
    expect(Object.keys(city.entities).length).toBeGreaterThan(0);
  }, 60_000);
});
