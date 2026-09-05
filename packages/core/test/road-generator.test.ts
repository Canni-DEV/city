import { describe, expect, it } from "vitest";
import {
  CITY_PRESETS,
  type CityPreset,
  deriveAttemptSeed,
  generateRoadCity,
  hashGeneratedStructure,
  type MapSize,
  PRESET_PARAMETERS,
  validateLandCity,
  validatePlacedCity,
  validateRoadCity,
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

describe("M1–M3 city generation", () => {
  it("TST-001 produces the same structural hash for equal inputs", async () => {
    const first = await generateRoadCity(inputFor("golden-grid"));
    const second = await generateRoadCity({
      ...inputFor("golden-grid"),
      id: "a-distinct-library-id",
      timestamp: "2027-01-01T00:00:00.000Z",
    });
    expect(hashGeneratedStructure(first)).toBe(hashGeneratedStructure(second));
    expect(hashGeneratedStructure(first)).toMatchInlineSnapshot(`"7e2c1420"`);
  });

  it("TST-001 derives reproducible attempts and retries at most three times", async () => {
    expect(deriveAttemptSeed("retry-city", 2)).toBe("retry-city::0.4.0::attempt-2");
    const attempts: number[] = [];
    const city = await generateRoadCity(inputFor("retry-city"), {
      validateAttempt(document) {
        attempts.push(document.generator.attempt);
        return document.generator.attempt < 2 ? ["forced test retry"] : [];
      },
    });
    expect(attempts).toEqual([0, 1, 2]);
    expect(city.generator.attempt).toBe(2);
  });

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
        expect(validatePlacedCity(city, TEST_ASSETS), label).toEqual([]);
        expect(city.blocks.length, label).toBeGreaterThan(0);
        expect(city.lots.length, label).toBeGreaterThan(0);
        expect(Object.keys(city.entities).length, label).toBeGreaterThan(0);
        expect(city.roadGraph.nodes.filter((node) => node.kind === "gate")).toHaveLength(
          size === 64 ? 2 : size === 96 ? 3 : 4,
        );
      }
    }
  }, 90_000);
});
