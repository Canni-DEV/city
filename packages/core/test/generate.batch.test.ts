import { describe, expect, it } from "vitest";
import {
  CITY_PRESETS,
  type CityPreset,
  gateCountFor,
  generateRoadCity,
  type MapSize,
  occupiedRoadSet,
  PRESET_PARAMETERS,
  validateLandCity,
  validatePlacedCity,
  validateRoadCity,
  validateSidewalks,
} from "../src/index.js";
import { TEST_ASSETS } from "./catalog-assets.js";

const timestamp = "2026-09-04T12:00:00.000Z";

function inputFor(seed: string, preset: CityPreset = "balanced", size: MapSize = 64) {
  return {
    id: `city-${seed}`,
    name: `Test ${seed}`,
    seed,
    timestamp,
    parameters: { ...PRESET_PARAMETERS[preset], size },
    assets: TEST_ASSETS,
  };
}

const extremesInput = {
  id: "city-m2",
  name: "M2 test",
  seed: "frontage",
  timestamp: "2026-09-05T00:00:00.000Z",
  parameters: { ...PRESET_PARAMETERS.balanced, size: 64 as const },
  assets: TEST_ASSETS,
};

describe("generator occupancy batch", () => {
  it("TST-002/TST-003 validates 50 seeds per preset across all sizes", async () => {
    const sizes: readonly MapSize[] = [64, 96, 128];
    for (const preset of CITY_PRESETS) {
      for (let index = 0; index < 50; index += 1) {
        const size = sizes[index % sizes.length] ?? 64;
        const label = `${preset} seed ${index} at ${size}`;
        const city = await generateRoadCity(inputFor(`${preset}-${index}`, preset, size)).catch(
          (error: unknown) => {
            throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
          },
        );
        expect(validateRoadCity(city), label).toEqual([]);
        expect(validateLandCity(city), label).toEqual([]);
        expect(validateSidewalks(city), label).toEqual([]);
        expect(validatePlacedCity(city, TEST_ASSETS), label).toEqual([]);
        expect(city.blocks.length, label).toBeGreaterThan(0);
        expect(city.lots.length, label).toBeGreaterThan(0);
        expect(city.sidewalks.length, label).toBeGreaterThan(0);
        expect(Object.keys(city.entities).length, label).toBeGreaterThan(0);
        expect(city.roadGraph.nodes.filter((node) => node.kind === "gate")).toHaveLength(
          gateCountFor(size),
        );
        const roads = occupiedRoadSet(city.roadGraph.cells);
        const manzanas = city.blocks.filter((block) => {
          const sides = new Set<string>();
          for (const [x, y] of block.cells) {
            if (roads.has(`${x},${y - 1}`)) sides.add("north");
            if (roads.has(`${x + 1},${y}`)) sides.add("east");
            if (roads.has(`${x},${y + 1}`)) sides.add("south");
            if (roads.has(`${x - 1},${y}`)) sides.add("west");
          }
          if (sides.size < 3) return false;
          const xs = block.cells.map(([x]) => x);
          const ys = block.cells.map(([, y]) => y);
          const width = Math.max(...xs) - Math.min(...xs) + 1;
          const height = Math.max(...ys) - Math.min(...ys) + 1;
          return Math.min(width, height) >= 6 && Math.max(width, height) <= 18;
        });
        if (size >= 96) {
          expect(manzanas.length, label).toBeGreaterThan(0);
        }
      }
    }
  }, 600_000);

  it("GEN-023 handles zero shares, maximum parks and advanced district extremes", async () => {
    for (const districtCount of [2, 8]) {
      const city = await generateRoadCity({
        ...extremesInput,
        parameters: {
          ...extremesInput.parameters,
          districtCount,
          zoneMix: { suburban: 0, urban: 100, commercial: 0, industrial: 0, park: 25 },
        },
      });
      expect(validateLandCity(city)).toEqual([]);
      expect(city.blocks.every((block) => block.zone === "urban" || block.zone === "park")).toBe(
        true,
      );
      expect(Object.keys(city.entities).length).toBeGreaterThan(0);
    }
  }, 60_000);
});
