import { describe, expect, it } from "vitest";
import {
  GenerationCancelledError,
  generateRoadCity,
  hashGeneratedStructure,
  normalizeGenerationParameters,
  occupiedRoadSet,
  PRESET_PARAMETERS,
  quotaZoneAreaShares,
  validateLandCity,
  ZONE_TYPES,
} from "../src/index.js";

import { TEST_ASSETS } from "./catalog-assets.js";

const input = {
  id: "city-m2",
  name: "M2 test",
  seed: "frontage",
  timestamp: "2026-09-05T00:00:00.000Z",
  parameters: { ...PRESET_PARAMETERS.balanced, size: 64 as const },
  assets: TEST_ASSETS,
};

describe("M2 blocks and zoning", () => {
  it("FUN-015 normalizes weights while retaining the requested park percentage", () => {
    const parameters = normalizeGenerationParameters({
      ...input.parameters,
      zoneMix: { suburban: 1, urban: 2, commercial: 3, industrial: 4, park: 25 },
    });
    expect(parameters.zoneMix).toEqual({
      suburban: 7.5,
      urban: 15,
      commercial: 22.5,
      industrial: 30,
      park: 25,
    });
    expect(normalizeGenerationParameters(parameters)).toEqual(parameters);
    expect(() =>
      normalizeGenerationParameters({
        ...input.parameters,
        zoneMix: { suburban: 0, urban: 0, commercial: 0, industrial: 0, park: 25 },
      }),
    ).toThrow("positive weight");
    expect(() =>
      normalizeGenerationParameters({
        ...input.parameters,
        zoneMix: { ...input.parameters.zoneMix, park: 26 },
      }),
    ).toThrow();
  });

  it("GEN-022/GEN-023 independently proves coverage, rectangular non-overlapping lots and frontage", async () => {
    const city = await generateRoadCity(input);
    const roads = occupiedRoadSet(city.roadGraph.cells);
    const free = new Set(
      city.map.boundaryMask.flatMap((valid, index) =>
        valid && !roads.has(`${index % 64},${Math.floor(index / 64)}`)
          ? [`${index % 64},${Math.floor(index / 64)}`]
          : [],
      ),
    );
    const covered = city.blocks.flatMap((block) => block.cells.map((point) => point.join(",")));
    expect(new Set(covered)).toEqual(free);
    expect(covered.length).toBe(free.size);
    const occupied = new Set<string>();
    const deltas = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] } as const;
    for (const lot of city.lots) {
      const xs = lot.cells.map(([x]) => x),
        ys = lot.cells.map(([, y]) => y);
      expect(lot.cells.length).toBe(
        (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1),
      );
      const [dx, dy] = deltas[lot.frontage];
      const sidewalks = new Set(city.sidewalks.map((cell) => cell.position.join(",")));
      expect(lot.cells.some(([x, y]) => sidewalks.has(`${x + dx},${y + dy}`))).toBe(true);
      expect(lot.cells.every((point) => !sidewalks.has(point.join(",")))).toBe(true);
      for (const point of lot.cells) {
        expect(occupied.has(point.join(","))).toBe(false);
        expect(free.has(point.join(","))).toBe(true);
        occupied.add(point.join(","));
      }
    }
    for (const zone of ZONE_TYPES)
      expect(
        Math.abs(quotaZoneAreaShares(city)[zone] - city.generator.parameters.zoneMix[zone]),
      ).toBeLessThanOrEqual(5);
  }, 30_000);

  it("TST-003 rejects corrupt references, overlaps, nonrectangles, missing frontage and quotas", async () => {
    const city = await generateRoadCity(input);
    const mutate = (edit: (copy: typeof city) => void, issue: string) => {
      const copy = structuredClone(city);
      edit(copy);
      expect(
        validateLandCity(copy).some((message) => message.includes(issue)),
        issue,
      ).toBe(true);
    };
    const firstBlock = (copy: typeof city) => {
      const block = copy.blocks[0];
      if (!block) throw new Error("generated city has no blocks");
      return block;
    };
    const firstLot = (copy: typeof city) => {
      const lot = copy.lots[0];
      if (!lot) throw new Error("generated city has no lots");
      return lot;
    };
    mutate((copy) => {
      firstBlock(copy).districtId = "missing";
    }, "missing district");
    mutate((copy) => {
      copy.blocks.push(firstBlock(copy));
    }, "overlapping block");
    mutate((copy) => {
      copy.blocks.pop();
    }, "unassigned free cell");
    mutate((copy) => {
      firstLot(copy).blockId = "missing";
    }, "missing block");
    mutate((copy) => {
      copy.lots.push(firstLot(copy));
    }, "overlapping lot");
    mutate((copy) => {
      firstLot(copy).cells = [
        [-5, -5],
        [-3, -3],
      ];
    }, "not rectangular");
    mutate((copy) => {
      firstLot(copy).cells = [[-5, -5]];
    }, "no full sidewalk frontage");
    mutate((copy) => {
      for (const block of copy.blocks) block.zone = "park";
    }, "area tolerance");
  }, 30_000);

  it("TST-001 includes land in the canonical hash", async () => {
    const city = await generateRoadCity(input);
    const before = hashGeneratedStructure(city);
    const block = city.blocks[0];
    if (!block) throw new Error("generated city has no blocks");
    block.regenerationIndex += 1;
    expect(hashGeneratedStructure(city)).not.toBe(before);
  }, 30_000);

  it("FUN-016 cancels during each M2 and M3 stage without returning a partial city", async () => {
    for (const stage of [
      "blocks",
      "sidewalks",
      "lots",
      "zones",
      "placement",
      "decoration",
    ] as const) {
      let cancelled = false;
      await expect(
        generateRoadCity(input, {
          onProgress(progress) {
            if (progress.stage === stage) cancelled = true;
          },
          shouldCancel: () => cancelled,
        }),
      ).rejects.toBeInstanceOf(GenerationCancelledError);
    }
  }, 90_000);
});
