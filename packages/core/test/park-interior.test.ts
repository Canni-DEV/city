import { describe, expect, it } from "vitest";
import {
  buildPedestrianNetwork,
  generateRoadCity,
  hashGeneratedStructure,
  isParkSharedCellAsset,
  isPedestrianNonObstacle,
  isPocketParkBlock,
  occupiedRoadSet,
  PARK_PATH_ASSETS,
  PARK_STATUE_ASSETS,
  PRESET_PARAMETERS,
  sidewalkKeySet,
  validatePlacedCity,
} from "../src/index.js";
import { TEST_ASSETS } from "./catalog-assets.js";

const input = {
  id: "city-parks",
  name: "Parks",
  seed: "frontage",
  timestamp: "2026-09-06T00:00:00.000Z",
  parameters: { ...PRESET_PARAMETERS.balanced, size: 64 as const },
  assets: TEST_ASSETS,
};

const statues = new Set<string>(PARK_STATUE_ASSETS);
const paths = new Set<string>(PARK_PATH_ASSETS);

describe("TST-011 park interiors", () => {
  it("composes one statue plaza in habitable parks and a grove in pocket remnants", async () => {
    const city = await generateRoadCity(input);
    const roads = occupiedRoadSet(city.roadGraph.cells);
    expect(validatePlacedCity(city, TEST_ASSETS)).toEqual([]);
    const habitable = city.blocks.filter(
      (block) => block.zone === "park" && !isPocketParkBlock(block.cells, roads),
    );
    const pockets = city.blocks.filter(
      (block) => block.zone === "park" && isPocketParkBlock(block.cells, roads),
    );
    const sidewalks = sidewalkKeySet(city);
    expect(habitable.length + pockets.length).toBeGreaterThan(0);
    for (const block of habitable) {
      const props = Object.values(city.entities).filter((entity) => entity.blockId === block.id);
      expect(props.filter((entity) => statues.has(entity.assetId))).toHaveLength(1);
      const interior = block.cells.filter((cell) => !sidewalks.has(`${cell[0]},${cell[1]}`));
      if (interior.length > 1) {
        expect(props.some((entity) => paths.has(entity.assetId))).toBe(true);
      }
    }
    for (const block of pockets) {
      const props = Object.values(city.entities).filter((entity) => entity.blockId === block.id);
      expect(props.some((entity) => statues.has(entity.assetId))).toBe(false);
      expect(props.some((entity) => paths.has(entity.assetId))).toBe(false);
      expect(props.length).toBeGreaterThan(0);
    }
  }, 30_000);

  it("keeps Nature Kit and plaza paths out of leftover non-park lots", async () => {
    const city = await generateRoadCity(input);
    for (const entity of Object.values(city.entities)) {
      if (entity.zone === "park" || entity.zone === null) continue;
      expect(entity.assetId.startsWith("nature:")).toBe(false);
    }
  }, 30_000);

  it("treats park-surface garnish as non-obstacles and statues as obstacles", async () => {
    const city = await generateRoadCity(input);
    const network = buildPedestrianNetwork(city);
    const obstacleIds = new Set(network.obstacles.map((obstacle) => obstacle.id));
    const shared = Object.values(city.entities).filter((entity) =>
      isParkSharedCellAsset(entity.assetId, entity.zone),
    );
    expect(shared.length).toBeGreaterThan(0);
    for (const entity of shared) {
      expect(isPedestrianNonObstacle(entity)).toBe(true);
      expect(obstacleIds.has(entity.id)).toBe(false);
    }
    const monuments = Object.values(city.entities).filter((entity) => statues.has(entity.assetId));
    expect(monuments.length).toBeGreaterThan(0);
    for (const entity of monuments) {
      expect(isPedestrianNonObstacle(entity)).toBe(false);
      expect(obstacleIds.has(entity.id)).toBe(true);
    }
  }, 30_000);

  it("keeps habitable park interiors reachable from the sidewalk ring", async () => {
    const city = await generateRoadCity(input);
    const roads = occupiedRoadSet(city.roadGraph.cells);
    const habitable = city.blocks.filter(
      (block) => block.zone === "park" && !isPocketParkBlock(block.cells, roads),
    );
    const network = buildPedestrianNetwork(city);
    const sidewalkComponents = new Set(
      [...network.nodes.values()]
        .filter((node) => node.kind === "sidewalk")
        .map((node) => node.component),
    );
    expect(sidewalkComponents.size).toBeGreaterThan(0);
    for (const block of habitable) {
      const parkNodes = [...network.nodes.values()].filter((node) => {
        if (node.kind !== "park") return false;
        const x = Math.floor(node.point[0]);
        const z = Math.floor(node.point[1]);
        return block.cells.some((cell) => cell[0] === x && cell[1] === z);
      });
      expect(parkNodes.length).toBeGreaterThan(0);
      expect(parkNodes.some((node) => sidewalkComponents.has(node.component))).toBe(true);
    }
  }, 30_000);

  it("TST-001 golden hash stays stable for generator 0.8.0 parks", async () => {
    const first = await generateRoadCity(input);
    const second = await generateRoadCity({ ...input, id: "city-parks-b" });
    expect(hashGeneratedStructure(first)).toBe(hashGeneratedStructure(second));
    expect(hashGeneratedStructure(first)).toMatchInlineSnapshot(`"3f67ab6b"`);
  }, 30_000);

  it("composes civic plazas on Balanced 96 seed green-crossroads", async () => {
    const city = await generateRoadCity({
      ...input,
      seed: "green-crossroads",
      parameters: { ...PRESET_PARAMETERS.balanced, size: 96 },
    });
    const roads = occupiedRoadSet(city.roadGraph.cells);
    const habitable = city.blocks.filter(
      (block) => block.zone === "park" && !isPocketParkBlock(block.cells, roads),
    );
    expect(habitable.length).toBeGreaterThan(0);
    expect(validatePlacedCity(city, TEST_ASSETS)).toEqual([]);
    for (const block of habitable) {
      const props = Object.values(city.entities).filter((entity) => entity.blockId === block.id);
      expect(props.filter((entity) => statues.has(entity.assetId))).toHaveLength(1);
      expect(props.some((entity) => paths.has(entity.assetId))).toBe(true);
    }
  }, 60_000);
});
