import { describe, expect, it } from "vitest";
import {
  buildPedestrianNetwork,
  type CityEntity,
  FRONTAGE_YAW,
  GenerationCancelledError,
  generateRoadCity,
  hashGeneratedStructure,
  isCurbFurnitureAsset,
  isLotYardDumpster,
  isYardZone,
  PRESET_PARAMETERS,
  pedestrianWalkableSet,
  sidewalkKeySet,
  validatePlacedCity,
  validateSidewalks,
  YARD_ALLOWLIST,
  YARD_DUMPSTER,
  YARD_FENCE,
  YARD_PATH,
  YARD_PLANTER,
  YARD_TREE_LARGE,
  YARD_TREE_SMALL,
  yawForLotFrontage,
} from "../src/index.js";
import { TEST_ASSETS } from "./catalog-assets.js";

const input = {
  id: "city-yards",
  name: "Yards",
  seed: "frontage",
  timestamp: "2026-09-07T00:00:00.000Z",
  parameters: { ...PRESET_PARAMETERS.balanced, size: 64 as const },
  assets: TEST_ASSETS,
};

const byId = new Map(TEST_ASSETS.map((asset) => [asset.id, asset]));

function entityCell(entity: CityEntity): [number, number] {
  return [
    Math.floor(entity.transform.position[0] ?? 0),
    Math.floor(entity.transform.position[2] ?? 0),
  ];
}

function lotOf(city: Awaited<ReturnType<typeof generateRoadCity>>, lotId: string | null) {
  return city.lots.find((lot) => lot.id === lotId);
}

function courtyardCells(
  city: Awaited<ReturnType<typeof generateRoadCity>>,
  block: Awaited<ReturnType<typeof generateRoadCity>>["blocks"][number],
): [number, number][] {
  const sidewalks = sidewalkKeySet(city);
  const owned = new Set(
    city.lots
      .filter((lot) => lot.blockId === block.id)
      .flatMap((lot) => lot.cells.map((cell) => cell.join(","))),
  );
  return block.cells.filter(
    (cell) => !sidewalks.has(`${cell[0]},${cell[1]}`) && !owned.has(`${cell[0]},${cell[1]}`),
  );
}

function isRearRow(cell: [number, number], lot: NonNullable<ReturnType<typeof lotOf>>): boolean {
  const xs = lot.cells.map(([x]) => x);
  const ys = lot.cells.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (lot.frontage === "south") return cell[1] === minY;
  if (lot.frontage === "north") return cell[1] === maxY;
  if (lot.frontage === "east") return cell[0] === minX;
  return cell[0] === maxX;
}

describe("yawForLotFrontage", () => {
  it("faces a south Kenney front toward each sidewalk", () => {
    expect(yawForLotFrontage("south", "south")).toBe(0);
    expect(yawForLotFrontage("west", "south")).toBe(90);
    expect(yawForLotFrontage("north", "south")).toBe(180);
    expect(yawForLotFrontage("east", "south")).toBe(270);
    expect(yawForLotFrontage("south", "omnidirectional")).toBe(FRONTAGE_YAW.south);
    expect(yawForLotFrontage("south", "north")).toBe(180);
  });
});

describe("TST-012 urban blocks", () => {
  it("yaws suburban and urban buildings toward the sidewalk", async () => {
    const city = await generateRoadCity(input);
    const buildings = Object.values(city.entities).filter((entity) => {
      if (!isYardZone(entity.zone)) return false;
      return byId.get(entity.assetId)?.category === "building";
    });
    expect(buildings.length).toBeGreaterThan(0);
    for (const entity of buildings) {
      const lot = lotOf(city, entity.lotId);
      const asset = byId.get(entity.assetId);
      expect(lot).toBeDefined();
      expect(asset).toBeDefined();
      if (!lot || !asset) continue;
      expect(entity.transform.rotation[1]).toBe(yawForLotFrontage(lot.frontage, asset.front));
    }
  }, 60_000);

  it("skips leftover scatter in suburban/urban and keeps the yard allowlist", async () => {
    const city = await generateRoadCity(input);
    expect(validatePlacedCity(city, TEST_ASSETS)).toEqual([]);
    const sidewalks = sidewalkKeySet(city);
    for (const entity of Object.values(city.entities)) {
      if (!isYardZone(entity.zone)) continue;
      expect(entity.assetId.startsWith("nature:")).toBe(false);
      expect(entity.assetId.startsWith("suburban:driveway")).toBe(false);
      const asset = byId.get(entity.assetId);
      if (asset?.category === "building") continue;
      if (isCurbFurnitureAsset(entity.assetId) && !isLotYardDumpster(entity, sidewalks)) continue;
      expect(YARD_ALLOWLIST.has(entity.assetId)).toBe(true);
    }
  }, 60_000);

  it("composes pocket greens in small courtyards and groves in larger ones", async () => {
    const city = await generateRoadCity(input);
    const pockets: string[] = [];
    const groves: string[] = [];
    for (const block of city.blocks) {
      if (!isYardZone(block.zone)) continue;
      const courtyard = courtyardCells(city, block);
      const props = Object.values(city.entities).filter(
        (entity) => entity.blockId === block.id && entity.lotId === null,
      );
      if (courtyard.length > 0 && courtyard.length <= 4) {
        pockets.push(block.id);
        expect(props.some((entity) => entity.assetId === YARD_TREE_LARGE)).toBe(false);
        expect(
          props.some(
            (entity) => entity.assetId === YARD_PLANTER || entity.assetId === YARD_TREE_SMALL,
          ),
        ).toBe(true);
        expect(props.some((entity) => entity.assetId === YARD_DUMPSTER)).toBe(false);
        expect(props.some((entity) => entity.assetId === YARD_FENCE)).toBe(false);
      } else if (courtyard.length > 4) {
        groves.push(block.id);
        expect(
          props.some(
            (entity) => entity.assetId === YARD_TREE_SMALL || entity.assetId === YARD_TREE_LARGE,
          ),
        ).toBe(true);
      }
    }
    expect(pockets.length + groves.length).toBeGreaterThan(0);
  }, 60_000);

  it("places lot dumpsters on the rear row and keeps curb dumpsters on commercial sidewalks", async () => {
    const city = await generateRoadCity(input);
    const sidewalks = sidewalkKeySet(city);
    const lotDumpsters = Object.values(city.entities).filter((entity) =>
      isLotYardDumpster(entity, sidewalks),
    );
    expect(lotDumpsters.length).toBeGreaterThan(0);
    for (const entity of lotDumpsters) {
      expect(isYardZone(entity.zone)).toBe(true);
      const lot = lotOf(city, entity.lotId);
      expect(lot).toBeDefined();
      if (!lot) continue;
      expect(isRearRow(entityCell(entity), lot)).toBe(true);
      expect(sidewalks.has(entityCell(entity).join(","))).toBe(false);
    }
    const curbDumpsters = Object.values(city.entities).filter(
      (entity) => entity.assetId === YARD_DUMPSTER && !isLotYardDumpster(entity, sidewalks),
    );
    for (const entity of curbDumpsters) {
      expect(entity.zone === "commercial" || entity.zone === "industrial").toBe(true);
      expect(sidewalks.has(entityCell(entity).join(","))).toBe(true);
    }
  }, 60_000);

  it("rejects malformed yard ownership and off-sidewalk curb dumpsters", async () => {
    const city = await generateRoadCity(input);
    const sidewalks = sidewalkKeySet(city);
    const lotDumpster = Object.values(city.entities).find((entity) =>
      isLotYardDumpster(entity, sidewalks),
    );
    expect(lotDumpster).toBeDefined();
    if (!lotDumpster) return;

    const withoutLot = structuredClone(city);
    const malformedDumpster = withoutLot.entities[lotDumpster.id];
    expect(malformedDumpster).toBeDefined();
    if (!malformedDumpster) return;
    malformedDumpster.lotId = null;
    expect(isLotYardDumpster(malformedDumpster, sidewalks)).toBe(false);
    expect(validatePlacedCity(withoutLot, TEST_ASSETS)).toContain(
      `entity ${malformedDumpster.id} leaves the valid mask`,
    );

    const outsideBlock = structuredClone(city);
    const malformedYardProp = outsideBlock.entities[lotDumpster.id];
    expect(malformedYardProp).toBeDefined();
    if (!malformedYardProp) return;
    malformedYardProp.transform.position = [0.5, malformedYardProp.transform.position[1], 0.5];
    expect(validatePlacedCity(outsideBlock, TEST_ASSETS)).toContain(
      `entity ${malformedYardProp.id} leaves its suburban/urban block`,
    );
  }, 60_000);

  it("puts fence-low only on lot side and back edges", async () => {
    const city = await generateRoadCity(input);
    const sidewalks = sidewalkKeySet(city);
    const fences = Object.values(city.entities).filter((entity) => entity.assetId === YARD_FENCE);
    expect(fences.length).toBeGreaterThan(0);
    for (const entity of fences) {
      const lot = lotOf(city, entity.lotId);
      expect(lot).toBeDefined();
      if (!lot) continue;
      const cell = entityCell(entity);
      const [dx, dy] =
        lot.frontage === "north"
          ? [0, -1]
          : lot.frontage === "south"
            ? [0, 1]
            : lot.frontage === "east"
              ? [1, 0]
              : [-1, 0];
      expect(sidewalks.has(`${cell[0] + dx},${cell[1] + dy}`)).toBe(false);
      const owned = new Set(lot.cells.map((point) => point.join(",")));
      const edge =
        !owned.has(`${cell[0] + 1},${cell[1]}`) ||
        !owned.has(`${cell[0] - 1},${cell[1]}`) ||
        !owned.has(`${cell[0]},${cell[1] + 1}`) ||
        !owned.has(`${cell[0]},${cell[1] - 1}`);
      expect(edge).toBe(true);
    }
  }, 60_000);

  it("keeps path-short off the sidewalk-adjacent front row", async () => {
    const city = await generateRoadCity(input);
    const sidewalks = sidewalkKeySet(city);
    const paths = Object.values(city.entities).filter(
      (entity) => entity.assetId === YARD_PATH && isYardZone(entity.zone),
    );
    for (const entity of paths) {
      const cell = entityCell(entity);
      expect(sidewalks.has(cell.join(","))).toBe(false);
      const adjacent =
        sidewalks.has(`${cell[0] + 1},${cell[1]}`) ||
        sidewalks.has(`${cell[0] - 1},${cell[1]}`) ||
        sidewalks.has(`${cell[0]},${cell[1] + 1}`) ||
        sidewalks.has(`${cell[0]},${cell[1] - 1}`);
      expect(adjacent).toBe(false);
    }
  }, 60_000);

  it("keeps lots and courtyards out of the pedestrian walkable set", async () => {
    const city = await generateRoadCity(input);
    expect(validateSidewalks(city)).toEqual([]);
    const walkable = pedestrianWalkableSet(city);
    const network = buildPedestrianNetwork(city);
    const sidewalkComponents = new Set(
      [...network.nodes.values()]
        .filter((node) => node.kind === "sidewalk")
        .map((node) => node.component),
    );
    expect(sidewalkComponents.size).toBe(1);
    for (const block of city.blocks) {
      if (!isYardZone(block.zone)) continue;
      for (const cell of courtyardCells(city, block)) {
        expect(walkable.has(`${cell[0]},${cell[1]}`)).toBe(false);
      }
    }
    for (const lot of city.lots) {
      const block = city.blocks.find((entry) => entry.id === lot.blockId);
      if (!block || !isYardZone(block.zone)) continue;
      for (const cell of lot.cells) {
        expect(walkable.has(`${cell[0]},${cell[1]}`)).toBe(false);
      }
    }
  }, 60_000);

  it("TST-001 golden hash stays stable for generator 0.9.0 yards", async () => {
    const city = await generateRoadCity(input);
    expect(city.generator.version).toBe("0.9.0");
    expect(validatePlacedCity(city, TEST_ASSETS)).toEqual([]);
    const first = hashGeneratedStructure(city);
    const second = await generateRoadCity({ ...input, id: "city-yards-b" });
    expect(hashGeneratedStructure(second)).toBe(first);
    expect(first).toMatchInlineSnapshot(`"8b332d50"`);
  }, 60_000);

  it("FUN-016 cancels during blockYards without returning a partial city", async () => {
    let cancelled = false;
    await expect(
      generateRoadCity(input, {
        onProgress(progress) {
          if (progress.stage === "blockYards") cancelled = true;
        },
        shouldCancel: () => cancelled,
      }),
    ).rejects.toBeInstanceOf(GenerationCancelledError);
  }, 60_000);
});
