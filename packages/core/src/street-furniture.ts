import type { CityDocumentV1, CityEntity, ZoneType } from "./domain.js";
import { deriveProceduralId } from "./ids.js";
import type { PlacementAsset } from "./placement-assets.js";
import type { SeededRandom } from "./rng.js";
import {
  CARDINALS,
  type Cardinal,
  DIRECTION_DELTA,
  isAvenueClass,
  OPPOSITE_CARDINAL,
  occupiedCellsForRoadTile,
  occupiedRoadSet,
  type Point,
  pointKey,
  type RoadClass,
} from "./road-tiles.js";

const CLASS_RANK: Record<RoadClass, number> = { local: 1, collector: 2, arterial: 3 };
const FACE_YAW = { south: 0, west: 90, north: 180, east: 270 } as const;
const RIGHT_HAND: Record<Cardinal, Cardinal> = {
  north: "east",
  east: "south",
  south: "west",
  west: "north",
};
const FURNITURE_GAP = 0.06;
const CURB_INSET = 0.32;
const JUNCTION_INSET = 0.22;

export const CURB_FURNITURE_ASSETS: ReadonlySet<string> = new Set([
  "roads:traffic-light",
  "roads:road-sign-stop",
  "roads:road-sign-street",
  "roads:road-sign-warning",
  "roads:sign-highway",
  "roads:sign-highway-detailed",
  "roads:sign-highway-wide",
  "roads:light-curved",
  "roads:light-square",
  "roads:electricity-pole-single",
  "roads:dumpster",
  "roads:construction-cone",
  "roads:construction-barrier",
]);

const NON_OBSTACLE_ASSETS: ReadonlySet<string> = new Set([
  "roads:traffic-light",
  "roads:road-sign-stop",
  "roads:road-sign-street",
  "roads:road-sign-warning",
  "roads:sign-highway",
  "roads:sign-highway-detailed",
  "roads:sign-highway-wide",
  "roads:light-curved",
  "roads:light-square",
  "roads:electricity-pole-single",
]);

const JUNCTION_ASSETS = /road-intersection|road-crossroad/;

export function isCurbFurnitureAsset(assetId: string): boolean {
  return CURB_FURNITURE_ASSETS.has(assetId);
}

export function isCurbClassNonObstacle(entity: CityEntity): boolean {
  return NON_OBSTACLE_ASSETS.has(entity.assetId);
}

export interface FurnitureAabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function curbFurnitureAabb(entity: CityEntity): FurnitureAabb {
  const yaw = entity.transform.rotation[1] ?? 0;
  const swap = yaw === 90 || yaw === 270;
  const width = swap ? entity.footprint.depth : entity.footprint.width;
  const depth = swap ? entity.footprint.width : entity.footprint.depth;
  const x = entity.transform.position[0] ?? 0;
  const z = entity.transform.position[2] ?? 0;
  if (entity.assetId.startsWith("roads:sign-highway")) {
    const radius = 0.08;
    return { minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius };
  }
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  };
}

export function furnitureAabbsOverlap(
  left: FurnitureAabb,
  right: FurnitureAabb,
  gap = FURNITURE_GAP,
): boolean {
  return (
    left.minX < right.maxX + gap &&
    left.maxX + gap > right.minX &&
    left.minZ < right.maxZ + gap &&
    left.maxZ + gap > right.minZ
  );
}

function add(point: Point, direction: Cardinal): Point {
  const [dx, dy] = DIRECTION_DELTA[direction];
  return [point[0] + dx, point[1] + dy];
}

function yawToFace(assetFront: string, toward: Cardinal): number {
  const from =
    assetFront === "north" ||
    assetFront === "east" ||
    assetFront === "south" ||
    assetFront === "west"
      ? assetFront
      : "south";
  return (FACE_YAW[toward] - FACE_YAW[from] + 360) % 360;
}

function clampToCell(value: number, cell: number): number {
  return Math.min(cell + 0.88, Math.max(cell + 0.12, value));
}

function curbPosition(cell: Point, towardRoad: Cardinal, towardJunction: Cardinal | null): Point {
  const [rx, rz] = DIRECTION_DELTA[towardRoad];
  const [jx, jz] = towardJunction ? DIRECTION_DELTA[towardJunction] : [0, 0];
  return [
    clampToCell(cell[0] + 0.5 + rx * CURB_INSET + jx * JUNCTION_INSET, cell[0]),
    clampToCell(cell[1] + 0.5 + rz * CURB_INSET + jz * JUNCTION_INSET, cell[1]),
  ];
}

function inMask(document: CityDocumentV1, x: number, z: number): boolean {
  const size = document.map.size;
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  if (ix < 0 || iz < 0 || ix >= size || iz >= size) return false;
  return document.map.boundaryMask[iz * size + ix] === true;
}

function bestClass(values: Iterable<RoadClass | undefined>): RoadClass {
  let best: RoadClass = "local";
  for (const value of values) {
    if (value && CLASS_RANK[value] > CLASS_RANK[best]) best = value;
  }
  return best;
}

function isJunctionAsset(assetId: string): boolean {
  return JUNCTION_ASSETS.test(assetId) && !assetId.includes("line");
}

function roadDirs(cell: Point, roads: ReadonlySet<string>): Cardinal[] {
  return CARDINALS.filter((direction) => roads.has(pointKey(add(cell, direction))));
}

function hasPerpendicularRoads(dirs: readonly Cardinal[]): boolean {
  return dirs.some((left) =>
    dirs.some((right) => left !== right && right !== OPPOSITE_CARDINAL[left]),
  );
}

function createCurbEntity(
  document: CityDocumentV1,
  index: number,
  asset: PlacementAsset,
  position: Point,
  yaw: number,
  refs: {
    districtId: string | null;
    blockId: string | null;
    zone: ZoneType | null;
  },
): CityEntity {
  return {
    id: deriveProceduralId(
      document.generator.version,
      document.generator.seed,
      document.generator.attempt,
      "entity",
      index,
    ),
    assetId: asset.id,
    districtId: refs.districtId,
    blockId: refs.blockId,
    lotId: null,
    zone: refs.zone,
    transform: {
      position: [position[0], asset.verticalOffset, position[1]],
      rotation: [0, yaw, 0],
      scale: [1, 1, 1],
    },
    footprint: {
      width: asset.footprint.width,
      depth: asset.footprint.depth,
      clearance: 0,
    },
    origin: "procedural",
    editState: "generated",
    zoneCompatibilityWarning: false,
  };
}

interface Placer {
  document: CityDocumentV1;
  catalog: Map<string, PlacementAsset>;
  entities: CityEntity[];
  aabbs: FurnitureAabb[];
  reserved: Set<string>;
  sidewalks: Set<string>;
  sidewalkOf: Map<string, CityDocumentV1["sidewalks"][number]>;
  blocks: Map<string, CityDocumentV1["blocks"][number]>;
  roads: ReadonlySet<string>;
  classes: Map<string, RoadClass>;
  indexOffset: number;
}

function tryPlace(
  placer: Placer,
  assetId: string,
  cell: Point,
  position: Point,
  yaw: number,
): boolean {
  const asset = placer.catalog.get(assetId);
  if (!asset) return false;
  if (!placer.sidewalks.has(pointKey(cell))) return false;
  if (!inMask(placer.document, position[0], position[1])) return false;
  const sidewalk = placer.sidewalkOf.get(pointKey(cell));
  const block = sidewalk ? placer.blocks.get(sidewalk.blockId) : undefined;
  const entity = createCurbEntity(
    placer.document,
    placer.indexOffset + placer.entities.length,
    asset,
    position,
    yaw,
    {
      districtId: block?.districtId ?? null,
      blockId: block?.id ?? null,
      zone: block?.zone ?? null,
    },
  );
  const aabb = curbFurnitureAabb(entity);
  if (placer.aabbs.some((other) => furnitureAabbsOverlap(aabb, other))) return false;
  placer.entities.push(entity);
  placer.aabbs.push(aabb);
  placer.reserved.add(pointKey(cell));
  return true;
}

function floodClusters(cells: readonly Point[]): Point[][] {
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

function junctionClusters(document: CityDocumentV1): Point[][] {
  const cells: Point[] = [];
  for (const tile of document.roadGraph.cells) {
    if (!isJunctionAsset(tile.assetId)) continue;
    cells.push(...occupiedCellsForRoadTile(tile));
  }
  return floodClusters(cells);
}

function approachesOf(
  cluster: readonly Point[],
  roads: ReadonlySet<string>,
): Map<Cardinal, Point[]> {
  const clusterKeys = new Set(cluster.map(pointKey));
  const approaches = new Map<Cardinal, Point[]>();
  for (const cell of cluster) {
    for (const direction of CARDINALS) {
      const next = add(cell, direction);
      const key = pointKey(next);
      if (!roads.has(key) || clusterKeys.has(key)) continue;
      const list = approaches.get(direction) ?? [];
      list.push(next);
      approaches.set(direction, list);
    }
  }
  for (const [direction, cells] of approaches) {
    approaches.set(
      direction,
      [...cells].sort((left, right) => left[1] - right[1] || left[0] - right[0]),
    );
  }
  return approaches;
}

function approachClass(cells: readonly Point[], classes: Map<string, RoadClass>): RoadClass {
  return bestClass(cells.map((cell) => classes.get(pointKey(cell))));
}

function findRightCurb(
  approachCells: readonly Point[],
  heading: Cardinal,
  sidewalks: ReadonlySet<string>,
): Point | undefined {
  const right = RIGHT_HAND[heading];
  const scored: Array<{ cell: Point; score: number }> = [];
  for (const cell of approachCells) {
    for (const candidate of [add(cell, right), add(add(cell, heading), right)]) {
      if (!sidewalks.has(pointKey(candidate))) continue;
      const score = approachCells.reduce(
        (best, origin) =>
          Math.min(best, Math.abs(candidate[0] - origin[0]) + Math.abs(candidate[1] - origin[1])),
        Number.POSITIVE_INFINITY,
      );
      scored.push({ cell: candidate, score });
    }
  }
  scored.sort((left, right) => left.score - right.score || left.cell[1] - right.cell[1]);
  return scored[0]?.cell;
}

function placeApproachDevice(
  placer: Placer,
  approachCells: readonly Point[],
  side: Cardinal,
  assetId: string,
): void {
  const heading = OPPOSITE_CARDINAL[side];
  const cell = findRightCurb(approachCells, heading, placer.sidewalks);
  if (!cell) return;
  const towardRoad = OPPOSITE_CARDINAL[RIGHT_HAND[heading]];
  const asset = placer.catalog.get(assetId);
  const yaw = yawToFace(asset?.front ?? "west", side);
  tryPlace(placer, assetId, cell, curbPosition(cell, towardRoad, heading), yaw);
}

function placeJunctionControl(placer: Placer): void {
  for (const cluster of junctionClusters(placer.document)) {
    const approaches = approachesOf(cluster, placer.roads);
    const sides = [...approaches.keys()].sort();
    if (sides.length < 3) continue;
    const ranked = sides.map((side) => ({
      side,
      cells: approaches.get(side) ?? [],
      roadClass: approachClass(approaches.get(side) ?? [], placer.classes),
    }));
    const hasAvenue = ranked.some((entry) => isAvenueClass(entry.roadClass));
    if (!hasAvenue) continue;
    for (const entry of ranked) {
      placeApproachDevice(
        placer,
        entry.cells,
        entry.side,
        isAvenueClass(entry.roadClass) ? "roads:traffic-light" : "roads:road-sign-stop",
      );
    }
  }
}

function chebyshevToCluster(cell: Point, cluster: readonly Point[]): number {
  return cluster.reduce(
    (best, [cx, cz]) => Math.min(best, Math.max(Math.abs(cell[0] - cx), Math.abs(cell[1] - cz))),
    Number.POSITIVE_INFINITY,
  );
}

function streetCornersByJunction(placer: Placer): Point[][] {
  const clusters = junctionClusters(placer.document);
  const owned: Point[][] = clusters.map(() => []);
  for (const sidewalk of placer.document.sidewalks) {
    if (!hasPerpendicularRoads(roadDirs(sidewalk.position, placer.roads))) continue;
    let bestIndex = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const [index, cluster] of clusters.entries()) {
      const dist = chebyshevToCluster(sidewalk.position, cluster);
      if (dist > 1 || dist > bestDist) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) owned[bestIndex]?.push(sidewalk.position);
  }
  return owned;
}

function placeStreetCorners(placer: Placer): void {
  const asset = placer.catalog.get("roads:road-sign-street");
  if (!asset) return;
  for (const group of streetCornersByJunction(placer)) {
    const corners = [...group].sort((left, right) => left[1] - right[1] || right[0] - left[0]);
    for (const cell of corners) {
      const dirs = roadDirs(cell, placer.roads);
      const [x, z] = cell;
      const towardRoads = dirs.reduce(
        (sum, direction) => {
          sum[0] += DIRECTION_DELTA[direction][0];
          sum[1] += DIRECTION_DELTA[direction][1];
          return sum;
        },
        [0, 0] as Point,
      );
      const attempts: Point[] = [
        [
          clampToCell(x + 0.5 + towardRoads[0] * 0.26, x),
          clampToCell(z + 0.5 + towardRoads[1] * 0.26, z),
        ],
        [
          clampToCell(x + 0.5 - towardRoads[0] * 0.28, x),
          clampToCell(z + 0.5 - towardRoads[1] * 0.28, z),
        ],
        [clampToCell(x + 0.38, x), clampToCell(z + 0.38, z)],
      ];
      if (attempts.some((position) => tryPlace(placer, asset.id, cell, position, 0))) break;
    }
  }
}

function inboundFromGate(cell: Point, roads: ReadonlySet<string>, size: number): Cardinal {
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

function placeGateSigns(placer: Placer): void {
  const size = placer.document.map.size;
  for (const node of placer.document.roadGraph.nodes.filter((entry) => entry.kind === "gate")) {
    const inbound = inboundFromGate(node.position, placer.roads, size);
    const roadClass = placer.classes.get(pointKey(node.position));
    const assetId = isAvenueClass(roadClass) ? "roads:sign-highway-detailed" : "roads:sign-highway";
    const candidates: Point[] = [];
    const seen = new Set<string>([pointKey(node.position)]);
    const queue: Point[] = [node.position];
    for (const direction of CARDINALS) {
      const next = add(node.position, direction);
      if (placer.roads.has(pointKey(next))) {
        seen.add(pointKey(next));
        queue.push(next);
      }
    }
    while (queue.length && candidates.length < 24) {
      const cell = queue.shift();
      if (!cell) break;
      for (const direction of CARDINALS) {
        const next = add(cell, direction);
        const key = pointKey(next);
        if (placer.sidewalks.has(key)) candidates.push(next);
        if (!placer.roads.has(key) || seen.has(key)) continue;
        seen.add(key);
        queue.push(next);
      }
    }
    const unique = [
      ...new Map(candidates.map((cell) => [pointKey(cell), cell] as const)).values(),
    ].sort((left, right) => {
      const leftDist = Math.abs(left[0] - node.position[0]) + Math.abs(left[1] - node.position[1]);
      const rightDist =
        Math.abs(right[0] - node.position[0]) + Math.abs(right[1] - node.position[1]);
      return leftDist - rightDist || left[1] - right[1] || left[0] - right[0];
    });
    const asset = placer.catalog.get(assetId);
    const yaw = yawToFace(asset?.front ?? "west", OPPOSITE_CARDINAL[inbound]);
    for (const sidewalkCell of unique) {
      const towardRoad = roadDirs(sidewalkCell, placer.roads)[0] ?? OPPOSITE_CARDINAL[inbound];
      const positions: Point[] = [
        curbPosition(sidewalkCell, towardRoad, inbound),
        curbPosition(sidewalkCell, towardRoad, null),
        [
          clampToCell(sidewalkCell[0] + 0.5, sidewalkCell[0]),
          clampToCell(sidewalkCell[1] + 0.5, sidewalkCell[1]),
        ],
      ];
      if (positions.some((position) => tryPlace(placer, assetId, sidewalkCell, position, yaw))) {
        break;
      }
    }
  }
}

function placeWarnings(placer: Placer, random: SeededRandom): void {
  for (const tile of placer.document.roadGraph.cells) {
    const localCurve =
      (tile.assetId.includes("curve") || tile.assetId.includes("bend")) &&
      !isAvenueClass(tile.roadClass);
    const roundabout = tile.assetId.includes("roundabout");
    if (!localCurve && !roundabout) continue;
    if (!roundabout && random.float() > 0.28) continue;
    for (const cell of occupiedCellsForRoadTile(tile)) {
      for (const direction of CARDINALS) {
        const next = add(cell, direction);
        if (!placer.roads.has(pointKey(next))) continue;
        if (isAvenueClass(placer.classes.get(pointKey(next)))) continue;
        const heading = OPPOSITE_CARDINAL[direction];
        const sidewalk = findRightCurb([next], heading, placer.sidewalks);
        if (!sidewalk || placer.reserved.has(pointKey(sidewalk))) continue;
        const towardRoad = OPPOSITE_CARDINAL[RIGHT_HAND[heading]];
        const asset = placer.catalog.get("roads:road-sign-warning");
        if (
          tryPlace(
            placer,
            "roads:road-sign-warning",
            sidewalk,
            curbPosition(sidewalk, towardRoad, heading),
            yawToFace(asset?.front ?? "west", direction),
          )
        ) {
          break;
        }
      }
    }
  }
}

function midblockSidewalks(placer: Placer): CityDocumentV1["sidewalks"] {
  return [...placer.document.sidewalks]
    .filter((cell) => {
      const dirs = roadDirs(cell.position, placer.roads);
      return dirs.length === 1 && !hasPerpendicularRoads(dirs);
    })
    .sort(
      (left, right) => left.position[1] - right.position[1] || left.position[0] - right.position[0],
    );
}

function adjacentRoadClass(cell: Point, placer: Placer): RoadClass {
  return bestClass(
    roadDirs(cell, placer.roads).map((direction) =>
      placer.classes.get(pointKey(add(cell, direction))),
    ),
  );
}

function placeRhythm(
  placer: Placer,
  sidewalks: readonly CityDocumentV1["sidewalks"][number][],
  assetId: string,
  spacing: number,
  avenueOnly: boolean,
  towardLot: boolean,
): void {
  const asset = placer.catalog.get(assetId);
  if (!asset) return;
  let stride = 0;
  for (const sidewalk of sidewalks) {
    const roadClass = adjacentRoadClass(sidewalk.position, placer);
    if (avenueOnly && !isAvenueClass(roadClass)) continue;
    if (placer.reserved.has(pointKey(sidewalk.position))) {
      stride = 0;
      continue;
    }
    stride += 1;
    if (stride % spacing !== 0) continue;
    const roadDir = roadDirs(sidewalk.position, placer.roads)[0];
    if (!roadDir) continue;
    const toward = towardLot ? OPPOSITE_CARDINAL[roadDir] : roadDir;
    const front = asset.front === "not-applicable" ? "south" : asset.front;
    const yaw = assetId.startsWith("roads:light-")
      ? yawToFace(front, OPPOSITE_CARDINAL[roadDir])
      : assetId === "roads:electricity-pole-single"
        ? yawToFace(front, roadDir)
        : yawToFace(asset.front, roadDir);
    tryPlace(
      placer,
      assetId,
      sidewalk.position,
      curbPosition(sidewalk.position, toward, null),
      yaw,
    );
  }
}

function placeDumpstersAndConstruction(
  placer: Placer,
  sidewalks: readonly CityDocumentV1["sidewalks"][number][],
  random: SeededRandom,
): void {
  const decoration = placer.document.generator.parameters.decorationDensity;
  const dumpsterChance = 0.05 + (decoration / 100) * 0.07;
  const constructionChance = 0.018;
  for (const sidewalk of sidewalks) {
    const block = placer.blocks.get(sidewalk.blockId);
    if (!block) continue;
    if (placer.reserved.has(pointKey(sidewalk.position))) continue;
    const roadDir = roadDirs(sidewalk.position, placer.roads)[0];
    if (!roadDir) continue;
    if (
      (block.zone === "commercial" || block.zone === "industrial") &&
      random.float() < dumpsterChance
    ) {
      tryPlace(
        placer,
        "roads:dumpster",
        sidewalk.position,
        curbPosition(sidewalk.position, OPPOSITE_CARDINAL[roadDir], null),
        yawToFace("south", roadDir),
      );
      continue;
    }
    if (block.zone === "industrial" && random.float() < constructionChance) {
      const assetId =
        random.float() < 0.55 ? "roads:construction-cone" : "roads:construction-barrier";
      tryPlace(
        placer,
        assetId,
        sidewalk.position,
        curbPosition(sidewalk.position, OPPOSITE_CARDINAL[roadDir], null),
        0,
      );
    }
  }
}

/** GEN-030/031: deterministic curb furniture on sidewalks. */
export function placeStreetFurniture(
  document: CityDocumentV1,
  assets: readonly PlacementAsset[],
  random: SeededRandom,
  indexOffset = 0,
): CityEntity[] {
  const roads = occupiedRoadSet(document.roadGraph.cells);
  const classes = new Map<string, RoadClass>();
  for (const tile of document.roadGraph.cells) {
    for (const cell of occupiedCellsForRoadTile(tile)) {
      const current = classes.get(pointKey(cell));
      const next = tile.roadClass ?? "local";
      if (!current || CLASS_RANK[next] > CLASS_RANK[current]) classes.set(pointKey(cell), next);
    }
  }
  const placer: Placer = {
    document,
    catalog: new Map(assets.map((asset) => [asset.id, asset])),
    entities: [],
    aabbs: [],
    reserved: new Set(),
    sidewalks: new Set(document.sidewalks.map((cell) => pointKey(cell.position))),
    sidewalkOf: new Map(document.sidewalks.map((cell) => [pointKey(cell.position), cell])),
    blocks: new Map(document.blocks.map((block) => [block.id, block])),
    roads,
    classes,
    indexOffset,
  };
  placeGateSigns(placer);
  placeJunctionControl(placer);
  placeStreetCorners(placer);
  placeWarnings(placer, random);
  const midblock = midblockSidewalks(placer);
  const decoration = document.generator.parameters.decorationDensity;
  const lampSpacing = decoration >= 70 ? 3 : 4;
  const localLampSpacing = decoration >= 70 ? 4 : 6;
  placeRhythm(
    placer,
    midblock.filter((cell) => isAvenueClass(adjacentRoadClass(cell.position, placer))),
    "roads:light-curved",
    lampSpacing,
    true,
    false,
  );
  placeRhythm(
    placer,
    midblock.filter((cell) => !isAvenueClass(adjacentRoadClass(cell.position, placer))),
    "roads:light-square",
    localLampSpacing,
    false,
    false,
  );
  placeRhythm(placer, midblock, "roads:electricity-pole-single", 8, true, false);
  placeDumpstersAndConstruction(placer, midblock, random);
  return placer.entities;
}
