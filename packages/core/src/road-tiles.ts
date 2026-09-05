import { hashText } from "./rng.js";

export type Cardinal = "north" | "east" | "south" | "west";
export type RoadClass = "arterial" | "collector" | "local";
export type RoadTopology = "end" | "straight" | "bend" | "t" | "cross";

export type Point = [number, number];

export interface RoadTile {
  position: Point;
  assetId: string;
  rotation: number;
}

export const CARDINALS: readonly Cardinal[] = ["north", "east", "south", "west"];

export const DIRECTION_DELTA: Record<Cardinal, Point> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

/**
 * Catalog connectors at yaw 0 for tiles used by GEN-005.
 * Kenney City Kit Roads are Y-up with +X east and +Z south: straights run along X
 * (east–west) with sidewalks on ±Z, ends open to +X, T-junctions close the north side,
 * and 90° bends/curves open west+south (outer curb on the north-east).
 */
export const ROAD_TILE_CONNECTORS: Readonly<Record<string, readonly Cardinal[]>> = {
  "roads:road-end": ["east"],
  "roads:road-straight": ["east", "west"],
  "roads:road-square": ["east", "west"],
  "roads:road-bend": ["west", "south"],
  "roads:road-bend-sidewalk": ["west", "south"],
  "roads:road-curve": ["west", "south"],
  "roads:road-intersection": ["east", "south", "west"],
  "roads:road-intersection-line": ["east", "south", "west"],
  "roads:road-intersection-path": ["east", "south", "west"],
  "roads:road-crossroad": ["north", "east", "south", "west"],
  "roads:road-crossroad-line": ["north", "east", "south", "west"],
  "roads:road-crossroad-path": ["north", "east", "south", "west"],
  "roads:road-roundabout": ["north", "east", "south", "west"],
};

export const SIDEWALK_ASSET_ID = "roads:tile-low";

/** GEN-027: Kenney T/4-way meshes that read as pedestrian passages. */
export const PEDESTRIAN_PATH_TILES: ReadonlySet<string> = new Set([
  "roads:road-intersection-path",
  "roads:road-crossroad-path",
]);

/** GEN-027: arterial/collector T/4-way meshes whose connectors match topology. */
export const AVENUE_JUNCTION_TILES: ReadonlySet<string> = new Set([
  "roads:road-intersection",
  "roads:road-crossroad",
]);

const AVENUE_TILES: Record<RoadTopology, string> = {
  end: "roads:road-end",
  // Kenney road-square is a plaza with curb on all four sides; it cannot join a through street.
  straight: "roads:road-straight",
  bend: "roads:road-bend-sidewalk",
  t: "roads:road-intersection",
  cross: "roads:road-crossroad",
};

const LOCAL_TILES: Record<RoadTopology, string> = {
  end: "roads:road-end",
  straight: "roads:road-straight",
  bend: "roads:road-bend",
  t: "roads:road-intersection-path",
  cross: "roads:road-crossroad-path",
};

export function pointKey([x, y]: Point): string {
  return `${x},${y}`;
}

export function parsePointKey(value: string): Point {
  const [x, y] = value.split(",").map(Number);
  return [x ?? 0, y ?? 0];
}

export function neighborKeys(
  point: Point,
): Array<{ direction: Cardinal; key: string; point: Point }> {
  return CARDINALS.map((direction) => {
    const delta = DIRECTION_DELTA[direction];
    const next: Point = [point[0] + delta[0], point[1] + delta[1]];
    return { direction, key: pointKey(next), point: next };
  });
}

export function connectionNames(point: Point, occupied: ReadonlySet<string>): Cardinal[] {
  return neighborKeys(point)
    .filter(({ key }) => occupied.has(key))
    .map(({ direction }) => direction);
}

/** Clockwise cardinal rotation matching stored yaw (renderer applies -Y). */
export function rotateConnector(direction: Cardinal, yaw: number): Cardinal {
  const steps = ((Math.round(yaw / 90) % 4) + 4) % 4;
  const index = CARDINALS.indexOf(direction);
  return CARDINALS[(index + steps) % CARDINALS.length] ?? direction;
}

export function rotateConnectors(connectors: readonly Cardinal[], yaw: number): Cardinal[] {
  return [...new Set(connectors.map((direction) => rotateConnector(direction, yaw)))];
}

export function sameConnectors(left: readonly Cardinal[], right: readonly Cardinal[]): boolean {
  if (left.length !== right.length) return false;
  const needed = new Set(right);
  return left.every((direction) => needed.has(direction));
}

export function yawForConnectors(
  identity: readonly Cardinal[],
  needed: readonly Cardinal[],
): number | undefined {
  for (const yaw of [0, 90, 180, 270]) {
    if (sameConnectors(rotateConnectors(identity, yaw), needed)) return yaw;
  }
  return undefined;
}

export function topologyFromConnections(connections: readonly Cardinal[]): RoadTopology {
  if (connections.length <= 1) return "end";
  if (connections.length === 3) return "t";
  if (connections.length >= 4) return "cross";
  const [first, second] = connections;
  if (!first || !second) return "end";
  const opposite =
    (first === "north" && second === "south") ||
    (first === "south" && second === "north") ||
    (first === "east" && second === "west") ||
    (first === "west" && second === "east");
  return opposite ? "straight" : "bend";
}

export function tileAssetFor(roadClass: RoadClass, topology: RoadTopology): string {
  const palette = roadClass === "local" ? LOCAL_TILES : AVENUE_TILES;
  return palette[topology];
}

export function roadFootprint(assetId: string): { width: number; depth: number } {
  if (assetId === "roads:road-curve") return { width: 2, depth: 2 };
  if (assetId === "roads:road-roundabout") return { width: 3, depth: 3 };
  return { width: 1, depth: 1 };
}

export function occupiedCellsForRoadTile(tile: RoadTile): Point[] {
  const { width, depth } = roadFootprint(tile.assetId);
  const swap = tile.rotation === 90 || tile.rotation === 270;
  const alongX = swap ? depth : width;
  const alongZ = swap ? width : depth;
  const cells: Point[] = [];
  for (let dx = 0; dx < alongX; dx += 1) {
    for (let dy = 0; dy < alongZ; dy += 1) {
      cells.push([tile.position[0] + dx, tile.position[1] + dy]);
    }
  }
  return cells;
}

export function occupiedRoadSet(tiles: readonly RoadTile[]): Set<string> {
  const occupied = new Set<string>();
  for (const tile of tiles) {
    for (const cell of occupiedCellsForRoadTile(tile)) occupied.add(pointKey(cell));
  }
  return occupied;
}

export function resolveUnitTile(
  connections: readonly Cardinal[],
  roadClass: RoadClass,
): { assetId: string; rotation: number } {
  const topology = topologyFromConnections(connections);
  const assetId = tileAssetFor(roadClass, topology);
  const identity = ROAD_TILE_CONNECTORS[assetId] ?? connections;
  const rotation = yawForConnectors(identity, connections) ?? 0;
  return { assetId, rotation };
}

function inBounds(size: number, [x, y]: Point): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function maskIndex(size: number, [x, y]: Point): number {
  return y * size + x;
}

function degree(point: Point, occupied: ReadonlySet<string>): number {
  return connectionNames(point, occupied).length;
}

function curveOrigin(corner: Point, first: Point, second: Point): Point {
  const inner: Point = [first[0] + second[0] - corner[0], first[1] + second[1] - corner[1]];
  return [
    Math.min(corner[0], first[0], second[0], inner[0]),
    Math.min(corner[1], first[1], second[1], inner[1]),
  ];
}

function curveInner(corner: Point, first: Point, second: Point): Point {
  return [first[0] + second[0] - corner[0], first[1] + second[1] - corner[1]];
}

function boxCells(origin: Point, width: number, depth: number): Point[] {
  const cells: Point[] = [];
  for (let dx = 0; dx < width; dx += 1) {
    for (let dy = 0; dy < depth; dy += 1) cells.push([origin[0] + dx, origin[1] + dy]);
  }
  return cells;
}

function externalConnectors(
  origin: Point,
  width: number,
  depth: number,
  occupied: ReadonlySet<string>,
): Cardinal[] {
  const inside = new Set(boxCells(origin, width, depth).map(pointKey));
  const found: Cardinal[] = [];
  for (const direction of CARDINALS) {
    const hits = boxCells(origin, width, depth).some((cell) => {
      const next: Point = [
        cell[0] + DIRECTION_DELTA[direction][0],
        cell[1] + DIRECTION_DELTA[direction][1],
      ];
      const key = pointKey(next);
      return occupied.has(key) && !inside.has(key);
    });
    if (hits) found.push(direction);
  }
  return found;
}

export function tryArterialCurve(
  corner: Point,
  occupied: ReadonlySet<string>,
  size: number,
  covered: ReadonlySet<string>,
): { origin: Point; rotation: number } | undefined {
  const links = neighborKeys(corner).filter(({ key }) => occupied.has(key));
  if (links.length !== 2) return undefined;
  const first = links[0]?.point;
  const second = links[1]?.point;
  if (!first || !second) return undefined;
  if (topologyFromConnections(links.map(({ direction }) => direction)) !== "bend") return undefined;
  if (degree(first, occupied) !== 2 || degree(second, occupied) !== 2) return undefined;
  const inner = curveInner(corner, first, second);
  if (inner[0] < 0 || inner[1] < 0 || inner[0] >= size || inner[1] >= size) return undefined;
  if (occupied.has(pointKey(inner))) return undefined;
  const origin = curveOrigin(corner, first, second);
  if (origin[0] < 0 || origin[1] < 0 || origin[0] + 1 >= size || origin[1] + 1 >= size) {
    return undefined;
  }
  const cells = boxCells(origin, 2, 2);
  if (cells.some((cell) => covered.has(pointKey(cell)))) return undefined;
  const claimed = new Set(cells.map(pointKey));
  const expanded = new Set(occupied);
  for (const key of claimed) expanded.add(key);
  const needed = externalConnectors(origin, 2, 2, expanded);
  const rotation = yawForConnectors(ROAD_TILE_CONNECTORS["roads:road-curve"] ?? [], needed);
  if (rotation === undefined) return undefined;
  return { origin, rotation };
}

const ARM_DELTAS: readonly Point[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const CORNER_DELTAS: readonly Point[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** Kenney roundabout is a 3×3 mesh centered on an arterial 4-way. */
export function tryArterialRoundabout(
  center: Point,
  occupied: ReadonlySet<string>,
  size: number,
  covered: ReadonlySet<string>,
  mask: readonly boolean[],
): { origin: Point } | undefined {
  if (connectionNames(center, occupied).length !== 4) return undefined;
  const origin: Point = [center[0] - 1, center[1] - 1];
  if (!inBounds(size, origin) || !inBounds(size, [origin[0] + 2, origin[1] + 2])) return undefined;
  const cells = boxCells(origin, 3, 3);
  if (cells.some((cell) => !mask[maskIndex(size, cell)] || covered.has(pointKey(cell)))) {
    return undefined;
  }
  for (const [dx, dy] of ARM_DELTAS) {
    const arm: Point = [center[0] + dx, center[1] + dy];
    const approach: Point = [center[0] + dx * 2, center[1] + dy * 2];
    if (!occupied.has(pointKey(arm))) return undefined;
    if (!inBounds(size, approach) || !occupied.has(pointKey(approach))) return undefined;
  }
  for (const [dx, dy] of CORNER_DELTAS) {
    if (occupied.has(pointKey([center[0] + dx, center[1] + dy]))) return undefined;
  }
  const expanded = new Set(occupied);
  for (const cell of cells) expanded.add(pointKey(cell));
  const needed = externalConnectors(origin, 3, 3, expanded);
  if (!sameConnectors(needed, ["north", "east", "south", "west"])) return undefined;
  return { origin };
}

export function resolveRoadTiles(
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
  seed: string,
  roundaboutFrequency: number,
  mask: readonly boolean[],
): RoadTile[] {
  const occupied = new Set(classes.keys());
  const positions = [...occupied]
    .map(parsePointKey)
    .sort((left, right) => left[1] - right[1] || left[0] - right[0]);
  const covered = new Set<string>();
  const tiles: RoadTile[] = [];

  for (const corner of positions) {
    const key = pointKey(corner);
    if (covered.has(key)) continue;
    const roadClass = classes.get(key) ?? "local";
    if (roadClass === "local") continue;
    const curve = tryArterialCurve(corner, occupied, size, covered);
    if (!curve) continue;
    const tile: RoadTile = {
      position: curve.origin,
      assetId: "roads:road-curve",
      rotation: curve.rotation,
    };
    for (const cell of occupiedCellsForRoadTile(tile)) {
      covered.add(pointKey(cell));
      occupied.add(pointKey(cell));
    }
    tiles.push(tile);
  }

  for (const center of positions) {
    const key = pointKey(center);
    if (covered.has(key)) continue;
    if ((classes.get(key) ?? "local") !== "arterial") continue;
    const roll = (hashText(`${seed}:roundabout:${key}`) >>> 0) % 100;
    if (roll >= roundaboutFrequency) continue;
    const placed = tryArterialRoundabout(center, occupied, size, covered, mask);
    if (!placed) continue;
    const tile: RoadTile = {
      position: placed.origin,
      assetId: "roads:road-roundabout",
      rotation: 0,
    };
    for (const cell of occupiedCellsForRoadTile(tile)) {
      covered.add(pointKey(cell));
      occupied.add(pointKey(cell));
    }
    tiles.push(tile);
  }

  for (const position of positions) {
    const key = pointKey(position);
    if (covered.has(key)) continue;
    const connections = connectionNames(position, occupied);
    const roadClass = classes.get(key) ?? "local";
    const tile = resolveUnitTile(connections, roadClass);
    tiles.push({ position, assetId: tile.assetId, rotation: tile.rotation });
    covered.add(key);
  }

  return tiles.sort(
    (left, right) =>
      left.position[1] - right.position[1] ||
      left.position[0] - right.position[0] ||
      left.assetId.localeCompare(right.assetId),
  );
}

export function tileMatchesNeighbors(tile: RoadTile, occupied: ReadonlySet<string>): boolean {
  const identity = ROAD_TILE_CONNECTORS[tile.assetId];
  if (!identity) return false;
  const rotated = rotateConnectors(identity, tile.rotation);
  const { width, depth } = roadFootprint(tile.assetId);
  const needed =
    width === 1 && depth === 1
      ? connectionNames(tile.position, occupied)
      : externalConnectors(tile.position, width, depth, occupied);
  return sameConnectors(rotated, needed);
}
