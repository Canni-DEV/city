import { describe, expect, it } from "vitest";
import {
  AVENUE_JUNCTION_TILES,
  createSidewalkWalkPolicy,
  findPath,
  generateRoadCity,
  isPocketParkBlock,
  occupiedRoadSet,
  PEDESTRIAN_PATH_TILES,
  PRESET_PARAMETERS,
  SIDEWALK_ASSET_ID,
  sidewalkKeySet,
  validateSidewalks,
} from "../src/index.js";
import { TEST_ASSETS } from "./catalog-assets.js";

const input = {
  id: "city-sidewalks",
  name: "Sidewalks",
  seed: "frontage",
  timestamp: "2026-09-05T00:00:00.000Z",
  parameters: { ...PRESET_PARAMETERS.balanced, size: 64 as const },
  assets: TEST_ASSETS,
};

describe("M3.6.1 sidewalks", () => {
  it("GEN-026/SIM-008 rings habitable manzanas and leaves remnants as pocket parks", async () => {
    const city = await generateRoadCity(input);
    const roads = occupiedRoadSet(city.roadGraph.cells);
    const sidewalks = sidewalkKeySet(city);
    expect(city.sidewalks.length).toBeGreaterThan(0);
    expect(city.sidewalks.every((cell) => cell.assetId === SIDEWALK_ASSET_ID)).toBe(true);
    expect(validateSidewalks(city)).toEqual([]);
    for (const block of city.blocks) {
      const pocket = isPocketParkBlock(block.cells, roads);
      const ringCells = block.cells.filter(
        ([x, y]) =>
          sidewalks.has(`${x},${y}`) ||
          roads.has(`${x + 1},${y}`) ||
          roads.has(`${x - 1},${y}`) ||
          roads.has(`${x},${y + 1}`) ||
          roads.has(`${x},${y - 1}`),
      );
      expect(block.cells.every((cell) => sidewalks.has(cell.join(",")))).toBe(false);
      if (pocket) {
        expect(block.zone).toBe("park");
        expect(city.sidewalks.some((cell) => cell.blockId === block.id)).toBe(false);
        expect(city.lots.some((lot) => lot.blockId === block.id)).toBe(false);
        const planted = Object.values(city.entities).some((entity) => entity.blockId === block.id);
        expect(planted).toBe(true);
      } else {
        for (const [x, y] of block.cells) {
          const ring =
            roads.has(`${x + 1},${y}`) ||
            roads.has(`${x - 1},${y}`) ||
            roads.has(`${x},${y + 1}`) ||
            roads.has(`${x},${y - 1}`);
          expect(sidewalks.has(`${x},${y}`)).toBe(ring);
        }
        expect(ringCells.length).toBeGreaterThan(0);
      }
    }
    const habitablePark = city.blocks.find(
      (block) => block.zone === "park" && !isPocketParkBlock(block.cells, roads),
    );
    if (habitablePark) {
      expect(city.sidewalks.some((cell) => cell.blockId === habitablePark.id)).toBe(true);
    } else {
      expect(city.blocks.some((block) => block.zone === "park")).toBe(true);
    }
  }, 30_000);

  it("GEN-027 uses Kenney path tiles on local junctions and unsuffixed T/4-way on avenues", async () => {
    const city = await generateRoadCity(input);
    const pathTiles = city.roadGraph.cells.filter((cell) =>
      PEDESTRIAN_PATH_TILES.has(cell.assetId),
    );
    const avenueJunctions = city.roadGraph.cells.filter((cell) =>
      AVENUE_JUNCTION_TILES.has(cell.assetId),
    );
    expect(pathTiles.length).toBeGreaterThan(0);
    expect(avenueJunctions.length).toBeGreaterThan(0);
    expect(
      city.roadGraph.cells.some(
        (cell) =>
          cell.assetId === "roads:road-intersection-line" ||
          cell.assetId === "roads:road-crossroad-line",
      ),
    ).toBe(false);
    expect(city.roadGraph.cells.some((cell) => cell.assetId === "roads:road-straight")).toBe(true);
    const twins = city.roadGraph.cells.filter((cell) => {
      if (cell.assetId !== "roads:road-straight") return false;
      const [x, y] = cell.position;
      return city.roadGraph.cells.some(
        (other) =>
          other.assetId === "roads:road-straight" &&
          Math.abs(other.position[0] - x) + Math.abs(other.position[1] - y) === 1,
      );
    });
    expect(twins.length).toBeGreaterThan(0);
  }, 30_000);

  it("SIM-002 walk policy uses sidewalks and corner crossings, not the avenue run", async () => {
    const city = await generateRoadCity(input);
    const policy = createSidewalkWalkPolicy(city);
    const sidewalks = sidewalkKeySet(city);
    const roads = occupiedRoadSet(city.roadGraph.cells);
    expect(policy.kind).toBe("sidewalk-graph");
    const sample = city.sidewalks[0]?.position;
    expect(sample && policy.isWalkable(sample)).toBe(true);
    const spawn = new Set(policy.spawnCells().map((cell) => cell.join(",")));
    expect([...spawn].every((cell) => sidewalks.has(cell))).toBe(true);
    const midStreet = [...roads].find(
      (cell) => !policy.isWalkable(cell.split(",").map(Number) as [number, number]),
    );
    expect(midStreet).toBeDefined();
    const avenueJunction = city.roadGraph.cells.find(
      (cell) => AVENUE_JUNCTION_TILES.has(cell.assetId) && policy.isWalkable(cell.position),
    );
    expect(avenueJunction).toBeDefined();
    const neighbors = city.sidewalks.filter((cell) => {
      const [x, y] = cell.position;
      const [jx, jy] = avenueJunction?.position ?? [Number.NaN, Number.NaN];
      return Math.abs(x - jx) + Math.abs(y - jy) === 1;
    });
    const across = neighbors.find(
      (cell) =>
        cell.position[0] !== neighbors[0]?.position[0] ||
        cell.position[1] !== neighbors[0]?.position[1],
    );
    if (neighbors[0] && across) {
      const path = findPath(policy, neighbors[0].position, across.position);
      expect(path).toBeDefined();
      expect(
        path?.some(
          (cell) =>
            cell[0] === avenueJunction?.position[0] && cell[1] === avenueJunction?.position[1],
        ),
      ).toBe(true);
    }
  }, 30_000);
});
