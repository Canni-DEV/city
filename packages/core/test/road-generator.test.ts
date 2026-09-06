import { describe, expect, it } from "vitest";
import {
  type CityPreset,
  deriveAttemptSeed,
  gateCountFor,
  generateRoadCity,
  hashGeneratedStructure,
  type MapSize,
  PRESET_PARAMETERS,
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

describe("M1–M3.5 city generation", () => {
  it("TST-001 produces the same structural hash for equal inputs", async () => {
    const first = await generateRoadCity(inputFor("golden-grid"));
    const second = await generateRoadCity({
      ...inputFor("golden-grid"),
      id: "a-distinct-library-id",
      timestamp: "2027-01-01T00:00:00.000Z",
    });
    expect(hashGeneratedStructure(first)).toBe(hashGeneratedStructure(second));
    expect(hashGeneratedStructure(first)).toMatchInlineSnapshot(`"8d662a89"`);
  }, 60_000);

  it("TST-001 derives reproducible attempts and retries at most three times", async () => {
    expect(deriveAttemptSeed("retry-city", 2)).toBe("retry-city::0.6.7::attempt-2");
    const attempts: number[] = [];
    const city = await generateRoadCity(inputFor("golden-grid"), {
      validateAttempt(document) {
        attempts.push(document.generator.attempt);
        return document.generator.attempt < 2 ? ["forced test retry"] : [];
      },
    });
    expect(attempts).toEqual([0, 1, 2]);
    expect(city.generator.attempt).toBe(2);
  }, 60_000);

  it("uses 2/3/4 external gates for sizes 64/96/128/256", () => {
    expect(gateCountFor(64)).toBe(2);
    expect(gateCountFor(96)).toBe(3);
    expect(gateCountFor(128)).toBe(4);
    expect(gateCountFor(256)).toBe(4);
  });
});
