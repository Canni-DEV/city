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

export const OPPOSITE_CARDINAL: Record<Cardinal, Cardinal> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

export type LaneMates = ReadonlyMap<string, string>;

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

export function isAvenueClass(roadClass: RoadClass | undefined): boolean {
  return roadClass === "arterial" || roadClass === "collector";
}

/**
 * GEN-028: lane-mate is not a street. A road beyond the pair counts (see-through)
 * only when this cell already has a road on the opposite side — a true through-crossing.
 */
export function logicalConnections(
  cell: Point,
  occupied: ReadonlySet<string>,
  mates: LaneMates = new Map(),
): Cardinal[] {
  const mateKey = mates.get(pointKey(cell));
  const found: Cardinal[] = [];
  for (const { direction, key: nextKey } of neighborKeys(cell)) {
    if (mateKey === nextKey) {
      const opposite = OPPOSITE_CARDINAL[direction];
      const oppDelta = DIRECTION_DELTA[opposite];
      const oppositeKey = pointKey([cell[0] + oppDelta[0], cell[1] + oppDelta[1]]);
      const beyond = pointKey([
        cell[0] + DIRECTION_DELTA[direction][0] * 2,
        cell[1] + DIRECTION_DELTA[direction][1] * 2,
      ]);
      if (occupied.has(oppositeKey) && occupied.has(beyond)) found.push(direction);
      else {
        const others = connectionNames(cell, occupied).filter((name) => name !== direction);
        if (others.length === 1) {
          const only = others[0];
          if (only && OPPOSITE_CARDINAL[only] !== direction) found.push(direction);
        }
      }
      continue;
    }
    if (occupied.has(nextKey)) found.push(direction);
  }
  return found;
}

/** Outer curb of a live 2-cell pair: one logical connector, but the twin still continues. */
export function isLiveCarriagewayShoulder(
  point: Point,
  occupied: ReadonlySet<string>,
  mates: LaneMates = new Map(),
): boolean {
  const mateKey = mates.get(pointKey(point));
  if (!mateKey) return false;
  if (logicalConnections(point, occupied, mates).length > 1) return false;
  return logicalConnections(parsePointKey(mateKey), occupied, mates).length > 1;
}

export function logicalNeighborKeys(
  point: Point,
  occupied: ReadonlySet<string>,
  mates: LaneMates = new Map(),
): Array<{ direction: Cardinal; key: string; point: Point }> {
  const dirs = new Set(logicalConnections(point, occupied, mates));
  return neighborKeys(point).filter(({ direction }) => dirs.has(direction));
}

function pairKeys(mates: Map<string, string>, left: string, right: string): void {
  if (left === right || mates.has(left) || mates.has(right)) return;
  mates.set(left, right);
  mates.set(right, left);
}

/** Pair each 2-cell avenue run without treating a 4-way crossing as a twin. */
export function pairLaneMates(classes: ReadonlyMap<string, RoadClass>): Map<string, string> {
  const mates = new Map<string, string>();
  const avenueKeys = [...classes.keys()].filter((key) => isAvenueClass(classes.get(key))).sort();
  const avenueSet = new Set(avenueKeys);

  const avenueDirs = (point: Point): Set<Cardinal> =>
    new Set(
      neighborKeys(point)
        .filter(({ key }) => avenueSet.has(key))
        .map(({ direction }) => direction),
    );

  for (const key of avenueKeys) {
    if (mates.has(key)) continue;
    const point = parsePointKey(key);
    const dirs = avenueDirs(point);
    const vertical = dirs.has("north") && dirs.has("south");
    const horizontal = dirs.has("east") && dirs.has("west");
    if (vertical && horizontal) continue;
    const leftover: Cardinal[] = vertical
      ? (["east", "west"] as const).filter((direction) => dirs.has(direction))
      : horizontal
        ? (["south", "north"] as const).filter((direction) => dirs.has(direction))
        : [];
    for (const direction of leftover) {
      const next = neighborKeys(point).find((neighbor) => neighbor.direction === direction);
      if (!next || !avenueSet.has(next.key) || mates.has(next.key)) continue;
      const nextDirs = avenueDirs(next.point);
      const sharesAlong = vertical
        ? nextDirs.has("north") || nextDirs.has("south")
        : nextDirs.has("east") || nextDirs.has("west");
      const crossingStreet = vertical
        ? nextDirs.has("east") && nextDirs.has("west")
        : nextDirs.has("north") && nextDirs.has("south");
      if (!sharesAlong || crossingStreet) continue;
      pairKeys(mates, key, next.key);
      break;
    }
  }

  for (const key of avenueKeys) {
    if (mates.has(key)) continue;
    const point = parsePointKey(key);
    const neighbors = neighborKeys(point).filter(({ key: next }) => avenueSet.has(next));
    if (neighbors.length !== 2) continue;
    const [first, second] = neighbors;
    if (!first || !second) continue;
    if (OPPOSITE_CARDINAL[first.direction] === second.direction) continue;
    for (const candidate of neighbors) {
      if (mates.has(candidate.key)) continue;
      const along = neighbors.find((neighbor) => neighbor.key !== candidate.key);
      if (!along) continue;
      const candidateNeighbors = neighborKeys(candidate.point).filter(({ key: next }) =>
        avenueSet.has(next),
      );
      if (candidateNeighbors.length !== 2) continue;
      const sharesAlong = candidateNeighbors.some(
        (neighbor) => neighbor.direction === along.direction,
      );
      if (!sharesAlong) continue;
      pairKeys(mates, key, candidate.key);
      break;
    }
  }

  return mates;
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

/** Kenney 2×2 curve for a 1-cell-wide elbow. Dual carriageways occupy the inner cell, so this stays undefined there. */
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

/** Kenney roundabout is a 3×3 mesh centered on a 1-cell-wide 4-way (local or remnant arterial). */
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

function isOppositePair(arms: readonly Cardinal[]): boolean {
  return sameConnectors(arms, ["north", "south"]) || sameConnectors(arms, ["east", "west"]);
}

function insideDual(origin: Point, point: Point): boolean {
  return (
    point[0] >= origin[0] &&
    point[0] <= origin[0] + 1 &&
    point[1] >= origin[1] &&
    point[1] <= origin[1] + 1
  );
}

function edgeIsAvenueOutside(
  cell: Point,
  direction: Cardinal,
  origin: Point,
  occupied: ReadonlySet<string>,
): boolean {
  const next: Point = [
    cell[0] + DIRECTION_DELTA[direction][0],
    cell[1] + DIRECTION_DELTA[direction][1],
  ];
  return occupied.has(pointKey(next)) && !insideDual(origin, next);
}

function isCorridorOverlap2x2(origin: Point, occupied: ReadonlySet<string>): boolean {
  const rowHasHorizontal = (row: number): boolean =>
    [0, 1].some((column) => {
      const cell: Point = [origin[0] + column, origin[1] + row];
      return (
        edgeIsAvenueOutside(cell, "east", origin, occupied) ||
        edgeIsAvenueOutside(cell, "west", origin, occupied)
      );
    });
  const columnHasVertical = (column: number): boolean =>
    [0, 1].some((row) => {
      const cell: Point = [origin[0] + column, origin[1] + row];
      return (
        edgeIsAvenueOutside(cell, "north", origin, occupied) ||
        edgeIsAvenueOutside(cell, "south", origin, occupied)
      );
    });
  return rowHasHorizontal(0) && rowHasHorizontal(1) && columnHasVertical(0) && columnHasVertical(1);
}

function turningDualOrigins(
  occupied: ReadonlySet<string>,
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
): Point[] {
  const origins: Point[] = [];
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const origin: Point = [x, y];
      const cells = boxCells(origin, 2, 2);
      if (cells.some((cell) => !isAvenueClass(classes.get(pointKey(cell))))) continue;
      if (cells.some((cell) => !occupied.has(pointKey(cell)))) continue;
      if (!isCorridorOverlap2x2(origin, occupied)) continue;
      const arms = externalConnectors(origin, 2, 2, occupied);
      if (arms.length < 2 || isOppositePair(arms)) continue;
      origins.push(origin);
    }
  }
  return origins;
}

function dualJunctionTiles(
  origin: Point,
  occupied: ReadonlySet<string>,
  classes: ReadonlyMap<string, RoadClass>,
): RoadTile[] {
  const cells = boxCells(origin, 2, 2);
  const arms = externalConnectors(origin, 2, 2, occupied);
  const physicalTile = (position: Point): RoadTile => {
    const roadClass = classes.get(pointKey(position)) ?? "arterial";
    const connections = connectionNames(position, occupied);
    if (arms.length >= 3 && connections.length >= 4) {
      return { position, assetId: "roads:road-crossroad", rotation: 0 };
    }
    const unit = resolveUnitTile(connections, roadClass);
    return { position, assetId: unit.assetId, rotation: unit.rotation };
  };
  const tiles = cells.map(physicalTile);
  const isBend = (assetId: string) =>
    assetId === "roads:road-bend" || assetId === "roads:road-bend-sidewalk";
  if (arms.length === 2 && tiles.every((tile) => isBend(tile.assetId))) return tiles;
  return tiles;
}

export function resolveRoadTiles(
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
  seed: string,
  roundaboutFrequency: number,
  mask: readonly boolean[],
  mates: LaneMates = pairLaneMates(classes),
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

  for (const origin of turningDualOrigins(occupied, classes, size)) {
    const pending = boxCells(origin, 2, 2).filter((cell) => !covered.has(pointKey(cell)));
    if (pending.length === 0) continue;
    for (const tile of dualJunctionTiles(origin, occupied, classes)) {
      const key = pointKey(tile.position);
      if (covered.has(key)) continue;
      tiles.push(tile);
      covered.add(key);
    }
  }

  for (const position of positions) {
    const key = pointKey(position);
    if (covered.has(key)) continue;
    const connections = logicalConnections(position, occupied, mates);
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

export function tileMatchesNeighbors(
  tile: RoadTile,
  occupied: ReadonlySet<string>,
  mates: LaneMates = new Map(),
): boolean {
  const identity = ROAD_TILE_CONNECTORS[tile.assetId];
  if (!identity) return false;
  const rotated = rotateConnectors(identity, tile.rotation);
  const { width, depth } = roadFootprint(tile.assetId);
  const needed =
    width === 1 && depth === 1
      ? inTurningDualBlock(tile.position, occupied)
        ? connectionNames(tile.position, occupied)
        : logicalConnections(tile.position, occupied, mates)
      : externalConnectors(tile.position, width, depth, occupied);
  return sameConnectors(rotated, needed);
}

function inTurningDualBlock(point: Point, occupied: ReadonlySet<string>): boolean {
  for (const originX of [point[0], point[0] - 1]) {
    for (const originY of [point[1], point[1] - 1]) {
      if (originX < 0 || originY < 0) continue;
      const origin: Point = [originX, originY];
      const cells = boxCells(origin, 2, 2);
      if (cells.some((cell) => !occupied.has(pointKey(cell)))) continue;
      if (!isCorridorOverlap2x2(origin, occupied)) continue;
      const arms = externalConnectors(origin, 2, 2, occupied);
      if (arms.length >= 2 && !isOppositePair(arms)) return true;
    }
  }
  return false;
}
