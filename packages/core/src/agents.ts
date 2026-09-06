import type { CityDocumentV1, MapSize } from "./domain.js";
import type { SeededRandom } from "./rng.js";
import {
  neighborKeys,
  occupiedRoadSet,
  type Point,
  parsePointKey,
  pointKey,
  type RoadTile,
} from "./road-tiles.js";
import { pedestrianNeighbors, pedestrianWalkableSet, sidewalkKeySet } from "./sidewalks.js";

export const AGENT_SKINS = [
  "skaterMaleA",
  "skaterFemaleA",
  "cyborgFemaleA",
  "criminalMaleA",
] as const;
export type AgentSkin = (typeof AGENT_SKINS)[number];
export type AgentClip = "idle" | "run";

/** Cells per second. SIM-005: about one-third cell/s so Kenney Run reads as a walk. */
export const DEFAULT_AGENT_SPEED = 0.33;

/** SIM-006: 8–16 on 96 Auto/high; Low may reduce the count. UI may override 0–64. */
export function agentCountFor(mapSize: MapSize, quality: "low" | "medium" | "high"): number {
  const auto = mapSize <= 64 ? 8 : mapSize >= 256 ? 24 : mapSize >= 128 ? 16 : 12;
  if (quality === "low") return Math.max(4, Math.round(auto / 2));
  return auto;
}

/**
 * SIM-007: walkability is injected so a later player policy can leave the default
 * graph without rewriting the mover or avatar.
 */
export interface WalkPolicy {
  readonly kind: string;
  isWalkable(cell: Point): boolean;
  neighbors(cell: Point): Point[];
  sampleDestination(from: Point, rng: SeededRandom): Point | undefined;
  allCells(): Point[];
  spawnCells(): Point[];
}

function cellsFromSet(walkable: ReadonlySet<string>): Point[] {
  return [...walkable].sort().map(parsePointKey);
}

export function createGridWalkPolicy(walkable: ReadonlySet<string>, kind = "grid"): WalkPolicy {
  const cells = cellsFromSet(walkable);
  return {
    kind,
    isWalkable: (cell) => walkable.has(pointKey(cell)),
    neighbors(cell) {
      return neighborKeys(cell)
        .filter(({ key }) => walkable.has(key))
        .map(({ point }) => point);
    },
    sampleDestination(from, rng) {
      const fromKey = pointKey(from);
      const options = cells.filter((cell) => pointKey(cell) !== fromKey);
      if (options.length === 0) return undefined;
      return options[rng.integer(0, options.length - 1)];
    },
    allCells: () => cells.map((cell) => [...cell] as Point),
    spawnCells: () => cells.map((cell) => [...cell] as Point),
  };
}

/** Occupied `roadGraph` cells. Kept injectable; M3.6.1 default is sidewalks. */
export function createRoadWalkPolicy(tiles: readonly RoadTile[]): WalkPolicy {
  return createGridWalkPolicy(occupiedRoadSet(tiles), "road-graph");
}

/** SIM-002/008/009: sidewalks plus corner crossings; destinations stay on sidewalks. */
export function createSidewalkWalkPolicy(document: CityDocumentV1): WalkPolicy {
  const walkable = pedestrianWalkableSet(document);
  const sidewalks = sidewalkKeySet(document);
  const destinations = cellsFromSet(sidewalks);
  const base = createGridWalkPolicy(walkable, "sidewalk-graph");
  return {
    ...base,
    neighbors(cell) {
      return pedestrianNeighbors(cell, walkable, sidewalks);
    },
    sampleDestination(from, rng) {
      const fromKey = pointKey(from);
      const options = destinations.filter((cell) => pointKey(cell) !== fromKey);
      if (options.length === 0) return undefined;
      return options[rng.integer(0, options.length - 1)];
    },
    spawnCells: () => destinations.map((cell) => [...cell] as Point),
  };
}

export function walkableCells(policy: WalkPolicy, tiles?: readonly RoadTile[]): Point[] {
  const listed = policy.allCells();
  if (listed.length > 0) return listed;
  if (!tiles) return [];
  return [...occupiedRoadSet(tiles)]
    .filter((key) => policy.isWalkable(parsePointKey(key)))
    .sort()
    .map(parsePointKey);
}

export function findPath(policy: WalkPolicy, start: Point, goal: Point): Point[] | undefined {
  if (!policy.isWalkable(start) || !policy.isWalkable(goal)) return undefined;
  const startKey = pointKey(start);
  const goalKey = pointKey(goal);
  if (startKey === goalKey) return [[...start]];

  const cameFrom = new Map<string, string>();
  const cost = new Map([[startKey, 0]]);
  const points = new Map<string, Point>([[startKey, [...start]]]);
  const frontier: Array<{ key: string; score: number; order: number }> = [
    { key: startKey, score: manhattan(start, goal), order: 0 },
  ];
  let order = 1;

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.score - right.score || left.order - right.order);
    const current = frontier.shift();
    if (!current) break;
    if (current.key === goalKey) return reconstructPath(cameFrom, points, startKey, goalKey);
    const currentPoint = points.get(current.key);
    if (!currentPoint) continue;
    const currentCost = cost.get(current.key) ?? Number.POSITIVE_INFINITY;
    for (const neighbor of policy.neighbors(currentPoint)) {
      const nextKey = pointKey(neighbor);
      const nextCost = currentCost + 1;
      if (nextCost >= (cost.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      cost.set(nextKey, nextCost);
      cameFrom.set(nextKey, current.key);
      points.set(nextKey, [...neighbor]);
      frontier.push({
        key: nextKey,
        score: nextCost + manhattan(neighbor, goal),
        order,
      });
      order += 1;
    }
  }
  return undefined;
}

function reconstructPath(
  cameFrom: Map<string, string>,
  points: Map<string, Point>,
  startKey: string,
  goalKey: string,
): Point[] | undefined {
  const path: Point[] = [];
  let cursor = goalKey;
  while (true) {
    const point = points.get(cursor);
    if (!point) return undefined;
    path.push([...point]);
    if (cursor === startKey) break;
    const parent = cameFrom.get(cursor);
    if (!parent) return undefined;
    cursor = parent;
  }
  return path.reverse();
}

function manhattan(from: Point, to: Point): number {
  return Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
}
