import { describe, expect, it } from "vitest";
import {
  AVENUE_JUNCTION_TILES,
  buildPedestrianNetwork,
  CARDINALS,
  generateRoadCity,
  hashGeneratedStructure,
  isAvenueClass,
  isCurbClassNonObstacle,
  isCurbFurnitureAsset,
  occupiedCellsForRoadTile,
  occupiedRoadSet,
  type Point,
  PRESET_PARAMETERS,
  type RoadClass,
  validatePlacedCity,
  validateSidewalks,
} from "../src/index.js";
import { TEST_ASSETS } from "./catalog-assets.js";

const input = {
  id: "city-streets",
  name: "Streets",
  seed: "golden-grid",
  timestamp: "2026-09-06T00:00:00.000Z",
  parameters: { ...PRESET_PARAMETERS.balanced, size: 64 as const },
  assets: TEST_ASSETS,
};

function entitiesByAsset(city: Awaited<ReturnType<typeof generateRoadCity>>, assetId: string) {
  return Object.values(city.entities).filter((entity) => entity.assetId === assetId);
}

function sidewalkCellOf(
  city: Awaited<ReturnType<typeof generateRoadCity>>,
  entity: { transform: { position: number[] } },
) {
  const x = Math.floor(entity.transform.position[0] ?? 0);
  const z = Math.floor(entity.transform.position[2] ?? 0);
  return city.sidewalks.find((cell) => cell.position[0] === x && cell.position[1] === z);
}

function pointKey(point: Point): string {
  return `${point[0]},${point[1]}`;
}

function add(point: Point, direction: (typeof CARDINALS)[number]): Point {
  const delta = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] } as const;
  const [dx, dz] = delta[direction];
  return [point[0] + dx, point[1] + dz];
}

function floodJunctions(city: Awaited<ReturnType<typeof generateRoadCity>>): Point[][] {
  const cells: Point[] = [];
  for (const tile of city.roadGraph.cells) {
    if (!/road-intersection|road-crossroad/.test(tile.assetId) || tile.assetId.includes("line")) {
      continue;
    }
    cells.push(...occupiedCellsForRoadTile(tile));
  }
  const remaining = new Set(cells.map(pointKey));
  const lookup = new Map(cells.map((cell) => [pointKey(cell), cell] as const));
  const clusters: Point[][] = [];
  for (const start of [...remaining].sort()) {
    if (!remaining.has(start)) continue;
    const queue = [start];
    remaining.delete(start);
    const cluster: Point[] = [];
    while (queue.length) {
      const key = queue.pop();
      if (!key) break;
      const cell = lookup.get(key);
      if (!cell) continue;
      cluster.push(cell);
      for (const direction of CARDINALS) {
        const next = pointKey(add(cell, direction));
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        queue.push(next);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function inboundFromGate(
  cell: Point,
  roads: ReadonlySet<string>,
  size: number,
): (typeof CARDINALS)[number] {
  const inward = CARDINALS.filter((direction) => {
    const next = add(cell, direction);
    return (
      next[0] >= 0 && next[1] >= 0 && next[0] < size && next[1] < size && roads.has(pointKey(next))
    );
  });
  if (inward.length) return inward[0] ?? "south";
  const mid = size / 2;
  if (Math.abs(cell[0] - mid) >= Math.abs(cell[1] - mid)) {
    return cell[0] < mid ? "east" : "west";
  }
  return cell[1] < mid ? "south" : "north";
}

function roadClasses(city: Awaited<ReturnType<typeof generateRoadCity>>): Map<string, RoadClass> {
  const classes = new Map<string, RoadClass>();
  const rank: Record<RoadClass, number> = { local: 1, collector: 2, arterial: 3 };
  for (const tile of city.roadGraph.cells) {
    for (const cell of occupiedCellsForRoadTile(tile)) {
      const current = classes.get(pointKey(cell));
      const next = tile.roadClass ?? "local";
      if (!current || rank[next] > rank[current]) classes.set(pointKey(cell), next);
    }
  }
  return classes;
}

describe("TST-010 curb street furniture", () => {
  it("places control devices, corner signs, and gate highway signs on sidewalks", async () => {
    const city = await generateRoadCity(input);
    expect(validatePlacedCity(city, TEST_ASSETS)).toEqual([]);
    expect(validateSidewalks(city)).toEqual([]);
    const furniture = Object.values(city.entities).filter((entity) =>
      isCurbFurnitureAsset(entity.assetId),
    );
    expect(furniture.length).toBeGreaterThan(0);
    expect(entitiesByAsset(city, "roads:road-sign-street").length).toBeGreaterThan(0);
    expect(
      entitiesByAsset(city, "roads:traffic-light").length +
        entitiesByAsset(city, "roads:road-sign-stop").length,
    ).toBeGreaterThan(0);
    const gates = city.roadGraph.nodes.filter((node) => node.kind === "gate");
    const highway = Object.values(city.entities).filter((entity) =>
      entity.assetId.startsWith("roads:sign-highway"),
    );
    expect(highway.length).toBeGreaterThanOrEqual(gates.length);
    for (const entity of furniture) {
      expect(sidewalkCellOf(city, entity)).toBeDefined();
    }
    const leftoverStreetFurniture = Object.values(city.entities).filter((entity) => {
      if (isCurbFurnitureAsset(entity.assetId)) return false;
      const asset = TEST_ASSETS.find((entry) => entry.id === entity.assetId);
      return asset?.category === "street-furniture";
    });
    expect(leftoverStreetFurniture).toEqual([]);
  }, 30_000);

  it("GEN-031 keeps roundabouts free of stop signs and traffic lights", async () => {
    const city = await generateRoadCity({
      ...input,
      parameters: { ...input.parameters, roundaboutFrequency: 100, size: 96 },
    });
    const roads = occupiedRoadSet(city.roadGraph.cells);
    const roundaboutKeys = new Set(
      city.roadGraph.cells
        .filter((tile) => tile.assetId.includes("roundabout"))
        .flatMap((tile) => {
          const [x, z] = tile.position;
          const keys: string[] = [];
          for (let dx = 0; dx < 3; dx += 1) {
            for (let dz = 0; dz < 3; dz += 1) keys.push(`${x + dx},${z + dz}`);
          }
          return keys;
        }),
    );
    if (roundaboutKeys.size === 0) return;
    for (const entity of Object.values(city.entities)) {
      if (entity.assetId !== "roads:traffic-light" && entity.assetId !== "roads:road-sign-stop") {
        continue;
      }
      const x = Math.floor(entity.transform.position[0] ?? 0);
      const z = Math.floor(entity.transform.position[2] ?? 0);
      expect(roundaboutKeys.has(`${x},${z}`)).toBe(false);
      expect(roads.has(`${x},${z}`)).toBe(false);
    }
  }, 60_000);

  it("places lights on avenue T/4-way approaches and stops only before entering an avenue", async () => {
    const city = await generateRoadCity({
      ...input,
      seed: "frontage",
      parameters: { ...PRESET_PARAMETERS.balanced, size: 64 },
    });
    const classes = roadClasses(city);
    const hasAvenueJunction = city.roadGraph.cells.some((tile) =>
      AVENUE_JUNCTION_TILES.has(tile.assetId),
    );
    if (hasAvenueJunction) {
      expect(entitiesByAsset(city, "roads:traffic-light").length).toBeGreaterThan(0);
    }
    for (const entity of entitiesByAsset(city, "roads:road-sign-stop")) {
      const sidewalk = sidewalkCellOf(city, entity);
      expect(sidewalk).toBeDefined();
      const nearbyAvenue = floodJunctions(city).some((cluster) => {
        const nearStop = cluster.some(
          ([cx, cz]) =>
            Math.max(
              Math.abs((sidewalk?.position[0] ?? 0) - cx),
              Math.abs((sidewalk?.position[1] ?? 0) - cz),
            ) <= 2,
        );
        return nearStop && cluster.some((cell) => isAvenueClass(classes.get(pointKey(cell))));
      });
      expect(nearbyAvenue).toBe(true);
    }
    for (const cluster of floodJunctions(city)) {
      if (cluster.some((cell) => isAvenueClass(classes.get(pointKey(cell))))) continue;
      const stops = entitiesByAsset(city, "roads:road-sign-stop").filter((entity) => {
        const sidewalk = sidewalkCellOf(city, entity);
        if (!sidewalk) return false;
        return cluster.some(
          ([cx, cz]) =>
            Math.max(Math.abs(sidewalk.position[0] - cx), Math.abs(sidewalk.position[1] - cz)) <= 1,
        );
      });
      expect(stops).toEqual([]);
    }
    expect(entitiesByAsset(city, "roads:road-sign-street").length).toBeGreaterThan(0);
  }, 60_000);

  it("places one street-name post on the north-east corner of each T/4-way", async () => {
    const city = await generateRoadCity(input);
    const roads = occupiedRoadSet(city.roadGraph.cells);
    const opposite = { north: "south", south: "north", east: "west", west: "east" } as const;
    const signs = entitiesByAsset(city, "roads:road-sign-street");
    expect(signs.length).toBeGreaterThan(0);
    const clusters = floodJunctions(city);
    const owned: Point[][] = clusters.map(() => []);
    for (const sidewalk of city.sidewalks) {
      const dirs = CARDINALS.filter((direction) =>
        roads.has(pointKey(add(sidewalk.position, direction))),
      );
      const perp = dirs.some((left) =>
        dirs.some((right) => left !== right && right !== opposite[left]),
      );
      if (!perp) continue;
      let bestIndex = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const [index, cluster] of clusters.entries()) {
        const dist = Math.min(
          ...cluster.map(([cx, cz]) =>
            Math.max(Math.abs(sidewalk.position[0] - cx), Math.abs(sidewalk.position[1] - cz)),
          ),
        );
        if (dist > 1 || dist > bestDist) continue;
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = index;
        }
      }
      if (bestIndex >= 0) owned[bestIndex]?.push(sidewalk.position);
    }
    for (const group of owned) {
      const corners = [...group].sort((left, right) => left[1] - right[1] || right[0] - left[0]);
      const nearby = signs.filter((entity) => {
        const sidewalk = sidewalkCellOf(city, entity);
        if (!sidewalk) return false;
        return corners.some(
          (cell) => cell[0] === sidewalk.position[0] && cell[1] === sidewalk.position[1],
        );
      });
      expect(nearby.length).toBeLessThanOrEqual(1);
      if (corners.length === 0) {
        expect(nearby).toEqual([]);
        continue;
      }
      if (nearby.length === 1) {
        const sign = nearby[0];
        expect(sign).toBeDefined();
        if (!sign) continue;
        const cell = sidewalkCellOf(city, sign);
        expect(cell?.position).toEqual(corners[0]);
      }
    }
  }, 30_000);

  it("yaws street lamps so the arm faces the carriageway", async () => {
    const city = await generateRoadCity(input);
    const roads = occupiedRoadSet(city.roadGraph.cells);
    const lamps = [
      ...entitiesByAsset(city, "roads:light-curved"),
      ...entitiesByAsset(city, "roads:light-square"),
    ];
    expect(lamps.length).toBeGreaterThan(0);
    const faceYaw = { south: 0, west: 90, north: 180, east: 270 } as const;
    const opposite = { north: "south", south: "north", east: "west", west: "east" } as const;
    for (const entity of lamps) {
      const sidewalk = sidewalkCellOf(city, entity);
      expect(sidewalk).toBeDefined();
      const roadDir = CARDINALS.find((direction) =>
        roads.has(pointKey(add(sidewalk?.position ?? [0, 0], direction))),
      );
      expect(roadDir).toBeDefined();
      const expected = (faceYaw[opposite[roadDir ?? "south"]] - faceYaw.south + 360) % 360;
      expect(entity.transform.rotation[1]).toBe(expected);
    }
  }, 30_000);

  it("yaws gate highway signs to face inbound traffic", async () => {
    const city = await generateRoadCity(input);
    const roads = occupiedRoadSet(city.roadGraph.cells);
    const gates = city.roadGraph.nodes.filter((node) => node.kind === "gate");
    const highway = Object.values(city.entities).filter((entity) =>
      entity.assetId.startsWith("roads:sign-highway"),
    );
    expect(highway.length).toBeGreaterThanOrEqual(gates.length);
    expect(gates.length).toBeGreaterThan(0);
    const faceYaw = { south: 0, west: 90, north: 180, east: 270 } as const;
    const opposite = { north: "south", south: "north", east: "west", west: "east" } as const;
    for (const entity of highway) {
      const sidewalk = sidewalkCellOf(city, entity);
      expect(sidewalk).toBeDefined();
      const gate = gates
        .map((node) => ({
          node,
          dist:
            Math.abs((sidewalk?.position[0] ?? 0) - node.position[0]) +
            Math.abs((sidewalk?.position[1] ?? 0) - node.position[1]),
        }))
        .sort((left, right) => left.dist - right.dist)[0]?.node;
      expect(gate).toBeDefined();
      if (!gate) continue;
      const inbound = inboundFromGate(gate.position, roads, city.map.size);
      const expected = (faceYaw[opposite[inbound]] - faceYaw.west + 360) % 360;
      expect(entity.transform.rotation[1]).toBe(expected);
    }
  }, 30_000);

  it("keeps curb-class props out of the pedestrian obstacle set", async () => {
    const city = await generateRoadCity(input);
    const network = buildPedestrianNetwork(city);
    const exempt = Object.values(city.entities).filter(isCurbClassNonObstacle);
    expect(exempt.length).toBeGreaterThan(0);
    const obstacleIds = new Set(network.obstacles.map((obstacle) => obstacle.id));
    for (const entity of exempt) expect(obstacleIds.has(entity.id)).toBe(false);
    for (const sidewalk of city.sidewalks) {
      const point: [number, number] = [sidewalk.position[0] + 0.5, sidewalk.position[1] + 0.5];
      if (network.nodes.has(`s:${sidewalk.position[0]},${sidewalk.position[1]}`)) {
        expect(network.safe(point)).toBe(true);
      }
    }
  }, 30_000);

  it("TST-001 golden hash stays stable for generator 0.7.0", async () => {
    const first = await generateRoadCity(input);
    const second = await generateRoadCity({ ...input, id: "city-streets-b" });
    expect(hashGeneratedStructure(first)).toBe(hashGeneratedStructure(second));
    expect(hashGeneratedStructure(first)).toMatchInlineSnapshot(`"70de520f"`);
  }, 30_000);
});

describe("catalog AST-015 fronts", () => {
  it("reviews pole traffic lights and complete road signs", () => {
    const ids = [
      "roads:traffic-light",
      "roads:road-sign-stop",
      "roads:road-sign-warning",
      "roads:sign-highway",
    ];
    for (const id of ids) {
      const asset = TEST_ASSETS.find((entry) => entry.id === id);
      expect(asset?.front).toBe("west");
    }
  });
});
