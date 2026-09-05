import type { MapSize } from "./domain.js";
import { deriveProceduralId } from "./ids.js";
import type { SeededRandom } from "./rng.js";
import {
  CARDINALS,
  type Cardinal,
  DIRECTION_DELTA,
  isAvenueClass,
  isLiveCarriagewayShoulder,
  type LaneMates,
  logicalConnections,
  neighborKeys,
  OPPOSITE_CARDINAL,
  type Point,
  pairLaneMates,
  parsePointKey,
  pointKey,
  type RoadClass,
} from "./road-tiles.js";

const CLASS_RANK: Record<RoadClass, number> = { local: 1, collector: 2, arterial: 3 };
/** Sidewalk + lot + sidewalk. Consecutive street axes must be at least this far plus one. */
export const MIN_MANZANA_SPAN = 3;
export const MIN_STREET_GAP = MIN_MANZANA_SPAN + 1;
const DIRECTIONS: ReadonlyArray<{ name: Cardinal; delta: Point }> = CARDINALS.map((name) => ({
  name,
  delta: DIRECTION_DELTA[name],
}));

export function paintClass(
  classes: Map<string, RoadClass>,
  point: Point,
  roadClass: RoadClass,
): void {
  const key = pointKey(point);
  const current = classes.get(key);
  if (!current || CLASS_RANK[roadClass] > CLASS_RANK[current]) classes.set(key, roadClass);
}

function inBounds(size: number, [x, y]: Point): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function indexOf(size: number, x: number, y: number): number {
  return y * size + x;
}

function walkAxis(start: Point, goal: Point, horizontalFirst: boolean): Point[] {
  const path: Point[] = [[...start]];
  let x = start[0];
  let y = start[1];
  const apply = (dx: number, dy: number, count: number) => {
    for (let step = 0; step < count; step += 1) {
      x += dx;
      y += dy;
      path.push([x, y]);
    }
  };
  const east = goal[0] - start[0];
  const south = goal[1] - start[1];
  if (horizontalFirst) {
    apply(Math.sign(east), 0, Math.abs(east));
    apply(0, Math.sign(south), Math.abs(south));
  } else {
    apply(0, Math.sign(south), Math.abs(south));
    apply(Math.sign(east), 0, Math.abs(east));
  }
  return path;
}

function pathCost(
  path: readonly Point[],
  size: number,
  mask: readonly boolean[],
  occupied: ReadonlySet<string>,
  blocked: ReadonlySet<string>,
  endpoints: ReadonlySet<string>,
): number {
  let cost = 0;
  for (const point of path) {
    if (!inBounds(size, point)) return Number.POSITIVE_INFINITY;
    const key = pointKey(point);
    if (blocked.has(key) && !endpoints.has(key)) return Number.POSITIVE_INFINITY;
    if (occupied.has(key)) cost += 0.18;
    else if (mask[indexOf(size, point[0], point[1])]) cost += 1;
    else cost += 7;
  }
  return cost;
}

interface FrontierState {
  point: Point;
  cost: number;
  score: number;
  order: number;
  dir: number;
}

function routeTurnPenalized(
  start: Point,
  goal: Point,
  size: number,
  mask: readonly boolean[],
  occupied: ReadonlySet<string>,
  blocked: ReadonlySet<string>,
  endpoints: ReadonlySet<string>,
): Point[] | undefined {
  const startKey = pointKey(start);
  const goalKey = pointKey(goal);
  const frontier: FrontierState[] = [{ point: [...start], cost: 0, score: 0, order: 0, dir: -1 }];
  const costs = new Map([[`${startKey}:-1`, 0]]);
  const cameFrom = new Map<string, string>();
  const points = new Map<string, Point>([[startKey, [...start]]]);
  let order = 1;
  const stateKey = (point: Point, dir: number) => `${pointKey(point)}:${dir}`;

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.score - right.score || left.order - right.order);
    const current = frontier.shift();
    if (!current) break;
    if (pointKey(current.point) === goalKey) {
      const path: Point[] = [];
      let cursor = goalKey;
      while (true) {
        const point = points.get(cursor);
        if (!point) return undefined;
        path.push(point);
        if (cursor === startKey) break;
        const parent = cameFrom.get(cursor);
        if (!parent) return undefined;
        cursor = parent;
      }
      return path.reverse();
    }
    for (let dir = 0; dir < DIRECTIONS.length; dir += 1) {
      const direction = DIRECTIONS[dir];
      if (!direction) continue;
      const next: Point = [
        current.point[0] + direction.delta[0],
        current.point[1] + direction.delta[1],
      ];
      if (!inBounds(size, next)) continue;
      const nextKey = pointKey(next);
      if (blocked.has(nextKey) && !endpoints.has(nextKey)) continue;
      const turn = current.dir >= 0 && current.dir !== dir ? 3.4 : 0;
      const step = occupied.has(nextKey) ? 0.18 : mask[indexOf(size, next[0], next[1])] ? 1 : 7;
      const newCost = current.cost + step + turn;
      const nextState = stateKey(next, dir);
      if (newCost >= (costs.get(nextState) ?? Number.POSITIVE_INFINITY)) continue;
      costs.set(nextState, newCost);
      cameFrom.set(nextKey, pointKey(current.point));
      points.set(nextKey, next);
      const heuristic = Math.abs(goal[0] - next[0]) + Math.abs(goal[1] - next[1]);
      frontier.push({
        point: next,
        cost: newCost,
        score: newCost + heuristic,
        order,
        dir,
      });
      order += 1;
    }
  }
  return undefined;
}

export function routeCardinalCorridor(
  start: Point,
  goal: Point,
  size: number,
  mask: readonly boolean[],
  occupied: ReadonlySet<string>,
  blocked: ReadonlySet<string>,
): Point[] {
  const endpoints = new Set([pointKey(start), pointKey(goal)]);
  const candidates = [true, false].map((horizontalFirst) => {
    const path = walkAxis(start, goal, horizontalFirst);
    return { path, cost: pathCost(path, size, mask, occupied, blocked, endpoints) };
  });
  candidates.sort((left, right) => left.cost - right.cost);
  const best = candidates[0];
  if (best && Number.isFinite(best.cost)) return best.path;
  const fallback = routeTurnPenalized(start, goal, size, mask, occupied, blocked, endpoints);
  if (!fallback) throw new Error(`No route from ${pointKey(start)} to ${pointKey(goal)}`);
  return fallback;
}

export function localStreetSpacing(
  size: MapSize,
  regularity: number,
  random: SeededRandom,
): number {
  const [lo, hi] = size === 64 ? [7, 9] : [9, 13];
  const spread = (1 - regularity / 100) * ((hi - lo) / 2);
  const mid = (lo + hi) / 2;
  const value = mid + (random.float() * 2 - 1) * spread;
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

function paintLine(
  classes: Map<string, RoadClass>,
  size: number,
  mask: readonly boolean[],
  roadClass: RoadClass,
  vertical: boolean,
  coordinate: number,
): void {
  for (let cursor = 0; cursor < size; cursor += 1) {
    const point: Point = vertical ? [coordinate, cursor] : [cursor, coordinate];
    if (!inBounds(size, point)) continue;
    if (mask[indexOf(size, point[0], point[1])] || classes.has(pointKey(point))) {
      paintClass(classes, point, roadClass);
    }
  }
}

function pairLaneKeys(mates: Map<string, string>, left: string, right: string): void {
  if (left === right || mates.has(left) || mates.has(right)) return;
  mates.set(left, right);
  mates.set(right, left);
}

function axisPoint(vertical: boolean, axis: number, cursor: number): Point {
  return vertical ? [axis, cursor] : [cursor, axis];
}

/** Columns (or rows) that carry a through-avenue, not a single crossing. */
function strongAvenueAxes(
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
  vertical: boolean,
): number[] {
  const axes: number[] = [];
  for (let axis = 0; axis < size; axis += 1) {
    let along = 0;
    for (let cursor = 0; cursor < size; cursor += 1) {
      const point = axisPoint(vertical, axis, cursor);
      if (!isAvenueClass(classes.get(pointKey(point)))) continue;
      if (sharesAlong(new Set(avenueNeighborDirs(point, classes)), vertical)) along += 1;
    }
    if (along >= 3) axes.push(axis);
  }
  return axes;
}

function adjacentAxisClusters(axes: readonly number[]): number[][] {
  const clusters: number[][] = [];
  for (const axis of axes) {
    const last = clusters[clusters.length - 1];
    if (last && axis === (last[last.length - 1] ?? axis) + 1) last.push(axis);
    else clusters.push([axis]);
  }
  return clusters;
}

function chooseKeepPair(
  cluster: readonly number[],
  vertical: boolean,
  classes: ReadonlyMap<string, RoadClass>,
  protectedKeys: ReadonlySet<string>,
  size: number,
): [number, number] {
  let best: [number, number] = [cluster[0] ?? 0, (cluster[0] ?? 0) + 1];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < cluster.length - 1; index += 1) {
    const left = cluster[index];
    if (left === undefined) continue;
    const right = left + 1;
    if (!cluster.includes(right)) continue;
    let score = 0;
    for (const axis of [left, right]) {
      for (let cursor = 0; cursor < size; cursor += 1) {
        const key = pointKey(axisPoint(vertical, axis, cursor));
        if (protectedKeys.has(key)) score += 10;
        if (isAvenueClass(classes.get(key))) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = [left, right];
    }
  }
  return best;
}

/**
 * Adjacent parallel 1-cell centerlines are one 2-cell corridor, not a 3-cell slab.
 * Cells that continue a perpendicular avenue outside the cluster stay (real crossings).
 */
function collapseParallelAvenueAxes(
  classes: Map<string, RoadClass>,
  size: number,
  vertical: boolean,
  protectedKeys: ReadonlySet<string>,
): void {
  for (const cluster of adjacentAxisClusters(strongAvenueAxes(classes, size, vertical))) {
    if (cluster.length < 3) continue;
    const [keep0, keep1] = chooseKeepPair(cluster, vertical, classes, protectedKeys, size);
    const clusterSet = new Set(cluster);
    const perp: Cardinal[] = vertical ? ["east", "west"] : ["north", "south"];
    for (const extra of cluster) {
      if (extra === keep0 || extra === keep1) continue;
      for (let cursor = 0; cursor < size; cursor += 1) {
        const point = axisPoint(vertical, extra, cursor);
        const key = pointKey(point);
        const roadClass = classes.get(key);
        if (!roadClass || !isAvenueClass(roadClass)) continue;
        paintClass(classes, axisPoint(vertical, keep0, cursor), roadClass);
        paintClass(classes, axisPoint(vertical, keep1, cursor), roadClass);
        const continuesOutside = perp.some((direction) => {
          const next = neighborKeys(point).find((neighbor) => neighbor.direction === direction);
          if (!next || !isAvenueClass(classes.get(next.key))) return false;
          const nextAxis = vertical ? next.point[0] : next.point[1];
          return !clusterSet.has(nextAxis);
        });
        if (!continuesOutside && !protectedKeys.has(key)) {
          classes.delete(key);
          if (!roadOccupancyConnected(classes)) classes.set(key, roadClass);
        }
      }
    }
  }
}

function originalDirections(point: Point, original: ReadonlySet<string>): Set<Cardinal> {
  return new Set(
    neighborKeys(point)
      .filter(({ key }) => original.has(key))
      .map(({ direction }) => direction),
  );
}

function sharesAlong(dirs: ReadonlySet<Cardinal>, vertical: boolean): boolean {
  return vertical ? dirs.has("north") || dirs.has("south") : dirs.has("east") || dirs.has("west");
}

function stepKey(point: Point, direction: Cardinal): string {
  const delta = DIRECTION_DELTA[direction];
  return pointKey([point[0] + delta[0], point[1] + delta[1]]);
}

function isParallelLane(
  center: Point,
  toward: Cardinal,
  classes: ReadonlyMap<string, RoadClass>,
  vertical: boolean,
): boolean {
  const key = stepKey(center, toward);
  if (!isAvenueClass(classes.get(key))) return false;
  const dirs = new Set(
    neighborKeys(parsePointKey(key))
      .filter(({ key: next }) => isAvenueClass(classes.get(next)))
      .map(({ direction }) => direction),
  );
  return sharesAlong(dirs, vertical);
}

function avenueNeighborDirs(point: Point, classes: ReadonlyMap<string, RoadClass>): Cardinal[] {
  return neighborKeys(point)
    .filter(({ key }) => isAvenueClass(classes.get(key)))
    .map(({ direction }) => direction);
}

/**
 * GEN-028: assign each arterial/collector run an explicit 2-cell carriageway.
 * Parallel 1-cell axes that already touch (or form a 3+ slab) become one pair.
 * Remaining 1-cell runs dilate by one cell only when that does not merge corridors.
 */
export function widenAvenueCorridors(
  classes: Map<string, RoadClass>,
  size: number,
  protectedKeys: ReadonlySet<string> = new Set(),
): Map<string, string> {
  collapseParallelAvenueAxes(classes, size, true, protectedKeys);
  collapseParallelAvenueAxes(classes, size, false, protectedKeys);

  const centerlines = [...classes.entries()]
    .filter(([, roadClass]) => isAvenueClass(roadClass))
    .map(([key]) => key)
    .sort();
  const centerlineSet = new Set(centerlines);
  const mates = new Map<string, string>();

  for (const key of centerlines) {
    if (mates.has(key)) continue;
    const point = parsePointKey(key);
    const dirs = originalDirections(point, centerlineSet);
    const vertical = dirs.has("north") || dirs.has("south");
    const horizontal = dirs.has("east") || dirs.has("west");
    if (vertical && horizontal) continue;
    const perps: Cardinal[] = vertical ? ["east", "west"] : ["south", "north"];
    for (const direction of perps) {
      const next = neighborKeys(point).find((neighbor) => neighbor.direction === direction);
      if (!next || !centerlineSet.has(next.key) || mates.has(next.key)) continue;
      if (!sharesAlong(originalDirections(next.point, centerlineSet), vertical)) continue;
      pairLaneKeys(mates, key, next.key);
      break;
    }
  }

  const wouldCreateTriple = (center: Point, direction: Cardinal, vertical: boolean): boolean => {
    const back = OPPOSITE_CARDINAL[direction];
    if (isParallelLane(center, back, classes, vertical)) return true;
    const twin: Point = [
      center[0] + DIRECTION_DELTA[direction][0],
      center[1] + DIRECTION_DELTA[direction][1],
    ];
    return isParallelLane(twin, direction, classes, vertical);
  };

  for (const key of centerlines) {
    if (mates.has(key)) continue;
    const point = parsePointKey(key);
    const roadClass = classes.get(key);
    if (!roadClass || !isAvenueClass(roadClass)) continue;
    const dirs = originalDirections(point, centerlineSet);
    const vertical = dirs.has("north") || dirs.has("south");
    const horizontal = dirs.has("east") || dirs.has("west");
    if (vertical && horizontal) continue;
    const runVertical = vertical || !horizontal;
    const offsets: Cardinal[] = runVertical ? ["east", "west"] : ["south", "north"];
    for (const direction of offsets) {
      if (wouldCreateTriple(point, direction, runVertical)) continue;
      const twin: Point = [
        point[0] + DIRECTION_DELTA[direction][0],
        point[1] + DIRECTION_DELTA[direction][1],
      ];
      if (!inBounds(size, twin)) continue;
      const twinKey = pointKey(twin);
      if (isAvenueClass(classes.get(twinKey))) {
        if (!mates.has(twinKey)) pairLaneKeys(mates, key, twinKey);
        break;
      }
      paintClass(classes, twin, roadClass);
      pairLaneKeys(mates, key, twinKey);
      break;
    }
  }

  return pairLaneMates(classes);
}

function cellAllowed(point: Point, size: number, mask: readonly boolean[] | undefined): boolean {
  if (!inBounds(size, point)) return false;
  if (!mask) return true;
  return mask[indexOf(size, point[0], point[1])] === true;
}

function neighborAvenueClass(point: Point, classes: ReadonlyMap<string, RoadClass>): RoadClass {
  let best: RoadClass = "collector";
  for (const { key } of neighborKeys(point)) {
    const roadClass = classes.get(key);
    if (roadClass && isAvenueClass(roadClass) && CLASS_RANK[roadClass] > CLASS_RANK[best]) {
      best = roadClass;
    }
  }
  return best;
}

function fillingCreatesFatSlab(
  point: Point,
  roadClass: RoadClass,
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
): boolean {
  const next = new Map(classes);
  paintClass(next, point, roadClass);
  return fatStraightAvenueCells(next, size).length > fatStraightAvenueCells(classes, size).length;
}

/** Concave L gap: two perpendicular avenue neighbors and the fourth 2×2 cell still empty. */
function isOpenElbowGap(
  point: Point,
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
  mask: readonly boolean[] | undefined,
  neighbors: readonly { direction: Cardinal; point: Point }[],
): boolean {
  if (neighbors.length !== 2) return false;
  const first = neighbors[0];
  const second = neighbors[1];
  if (!first || !second) return false;
  if (OPPOSITE_CARDINAL[first.direction] === second.direction) return false;
  const fourth: Point = [
    first.point[0] + second.point[0] - point[0],
    first.point[1] + second.point[1] - point[1],
  ];
  if (!cellAllowed(fourth, size, mask)) return false;
  if (isAvenueClass(classes.get(pointKey(fourth)))) return false;
  return true;
}

/** Empty (or local) cell that sits between avenue cells of a real junction, not a 3-wide median. */
export function shouldStitchAvenueCell(
  point: Point,
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
  mask?: readonly boolean[],
): boolean {
  if (!cellAllowed(point, size, mask)) return false;
  const current = classes.get(pointKey(point));
  if (current && isAvenueClass(current)) return false;
  const ave = neighborKeys(point).filter(({ key }) => isAvenueClass(classes.get(key)));
  const dirs = new Set(ave.map(({ direction }) => direction));
  const opposite =
    (dirs.has("north") && dirs.has("south")) || (dirs.has("east") && dirs.has("west"));
  const corner = isOpenElbowGap(point, classes, size, mask, ave);
  if (opposite) {
    const fillingEastWest = dirs.has("east") && dirs.has("west");
    const sides = fillingEastWest ? (["east", "west"] as const) : (["north", "south"] as const);
    const parallel = sides.every((direction) => {
      const next = neighborKeys(point).find((neighbor) => neighbor.direction === direction);
      if (!next) return false;
      const neighborDirs = new Set(avenueNeighborDirs(next.point, classes));
      return fillingEastWest
        ? neighborDirs.has("north") && neighborDirs.has("south")
        : neighborDirs.has("east") && neighborDirs.has("west");
    });
    if (parallel) return false;
  }
  if (!opposite && !corner) return false;
  return !fillingCreatesFatSlab(point, neighborAvenueClass(point, classes), classes, size);
}

export function openAvenueGaps(
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
  mask?: readonly boolean[],
): string[] {
  const gaps: string[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const point: Point = [x, y];
      if (shouldStitchAvenueCell(point, classes, size, mask)) gaps.push(pointKey(point));
    }
  }
  return gaps.sort();
}

/**
 * Fill 1-cell holes and inner L corners so dual avenues meet as a designed junction block.
 */
export function stitchAvenueJunctions(
  classes: Map<string, RoadClass>,
  size: number,
  mask?: readonly boolean[],
): void {
  for (let guard = 0; guard < size * 8; guard += 1) {
    let changed = false;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const point: Point = [x, y];
        if (!shouldStitchAvenueCell(point, classes, size, mask)) continue;
        paintClass(classes, point, neighborAvenueClass(point, classes));
        changed = true;
      }
    }
    if (!changed) return;
  }
}

function avenueRunLength(
  point: Point,
  alongVertical: boolean,
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
): number {
  const step: Point = alongVertical ? [0, 1] : [1, 0];
  let count = 1;
  for (const sign of [-1, 1] as const) {
    let x = point[0];
    let y = point[1];
    while (true) {
      x += step[0] * sign;
      y += step[1] * sign;
      if (!inBounds(size, [x, y]) || !isAvenueClass(classes.get(pointKey([x, y])))) break;
      count += 1;
    }
  }
  return count;
}

/** Cells that sit in a 3+ wide through-slab (not a real crossing or the long axis of a pair). */
export function fatStraightAvenueCells(
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
): string[] {
  const drop = new Set<string>();
  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (!isAvenueClass(classes.get(pointKey([x, y])))) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < size && isAvenueClass(classes.get(pointKey([end, y])))) end += 1;
      const width = end - x;
      if (width >= 3) {
        let verticalThrough = 0;
        let along = Number.POSITIVE_INFINITY;
        for (let cursor = x; cursor < end; cursor += 1) {
          const point: Point = [cursor, y];
          const dirs = avenueNeighborDirs(point, classes);
          if (dirs.includes("north") && dirs.includes("south")) verticalThrough += 1;
          along = Math.min(along, avenueRunLength(point, true, classes, size));
        }
        if (verticalThrough === width && width <= along && along >= 4) {
          for (let cursor = x + 2; cursor < end; cursor += 1) drop.add(pointKey([cursor, y]));
        }
      }
      x = end;
    }
  }
  for (let x = 0; x < size; x += 1) {
    let y = 0;
    while (y < size) {
      if (!isAvenueClass(classes.get(pointKey([x, y])))) {
        y += 1;
        continue;
      }
      let end = y;
      while (end < size && isAvenueClass(classes.get(pointKey([x, end])))) end += 1;
      const width = end - y;
      if (width >= 3) {
        let horizontalThrough = 0;
        let along = Number.POSITIVE_INFINITY;
        for (let cursor = y; cursor < end; cursor += 1) {
          const point: Point = [x, cursor];
          const dirs = avenueNeighborDirs(point, classes);
          if (dirs.includes("east") && dirs.includes("west")) horizontalThrough += 1;
          along = Math.min(along, avenueRunLength(point, false, classes, size));
        }
        if (horizontalThrough === width && width <= along && along >= 4) {
          for (let cursor = y + 2; cursor < end; cursor += 1) drop.add(pointKey([x, cursor]));
        }
      }
      y = end;
    }
  }
  return [...drop].sort();
}

/** Collapse accidental 3+ cell slabs on a single through-run back to a 2-cell pair. */
export function trimStraightAvenueWidth(
  classes: Map<string, RoadClass>,
  size: number,
  protectedKeys: ReadonlySet<string> = new Set(),
): void {
  for (const key of fatStraightAvenueCells(classes, size)) {
    if (!protectedKeys.has(key)) classes.delete(key);
  }
}

/** Keep street axes at least MIN_STREET_GAP apart so a 1-cell ring still leaves an interior. */
export function keepSpacedAxes(coords: readonly number[], blocked: readonly number[]): number[] {
  const kept: number[] = [];
  for (const coord of [...coords].sort((left, right) => left - right)) {
    if ([...blocked, ...kept].some((other) => Math.abs(other - coord) < MIN_STREET_GAP)) continue;
    kept.push(coord);
  }
  return kept;
}

function majorRoadAxes(
  classes: ReadonlyMap<string, RoadClass>,
  size: number,
  vertical: boolean,
): number[] {
  const counts = new Map<number, number>();
  for (const [key, roadClass] of classes) {
    if (roadClass === "local") continue;
    const point = parsePointKey(key);
    const axis = vertical ? point[0] : point[1];
    counts.set(axis, (counts.get(axis) ?? 0) + 1);
  }
  const threshold = Math.max(8, Math.floor(size * 0.2));
  return [...counts.entries()].filter(([, count]) => count >= threshold).map(([axis]) => axis);
}

export function paintLocalMesh(
  size: MapSize,
  mask: readonly boolean[],
  classes: Map<string, RoadClass>,
  regularity: number,
  random: SeededRandom,
): void {
  const spacing = localStreetSpacing(size, regularity, random);
  const warp = 1 - regularity / 100;
  const originX = 2 + random.integer(0, Math.max(0, spacing - 1));
  const originY = 2 + random.integer(0, Math.max(0, spacing - 1));
  const vertical: number[] = [];
  for (let x = originX; x < size - 2; x += spacing) {
    const shift = Math.round((random.float() * 2 - 1) * warp * 2);
    vertical.push(Math.max(1, Math.min(size - 2, x + shift)));
  }
  const horizontal: number[] = [];
  for (let y = originY; y < size - 2; y += spacing) {
    const shift = Math.round((random.float() * 2 - 1) * warp * 2);
    horizontal.push(Math.max(1, Math.min(size - 2, y + shift)));
  }
  for (const x of keepSpacedAxes(vertical, majorRoadAxes(classes, size, true))) {
    paintLine(classes, size, mask, "local", true, x);
  }
  for (const y of keepSpacedAxes(horizontal, majorRoadAxes(classes, size, false))) {
    paintLine(classes, size, mask, "local", false, y);
  }
}

function occupiedSet(classes: ReadonlyMap<string, RoadClass>): Set<string> {
  return new Set(classes.keys());
}

function roadOccupancyConnected(classes: ReadonlyMap<string, RoadClass>): boolean {
  const keys = [...classes.keys()];
  if (keys.length === 0) return true;
  return floodComponents(keys).length === 1;
}

function floodComponents(keys: Iterable<string>): string[][] {
  const remaining = new Set(keys);
  const result: string[][] = [];
  for (const start of [...remaining].sort()) {
    if (!remaining.delete(start)) continue;
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (!current) continue;
      const point = parsePointKey(current);
      for (const { key } of neighborKeys(point)) {
        if (remaining.delete(key)) queue.push(key);
      }
    }
    result.push(queue);
  }
  return result;
}

export function connectLocalComponents(
  size: number,
  mask: readonly boolean[],
  classes: Map<string, RoadClass>,
): void {
  const arterial = new Set(
    [...classes.entries()].filter(([, value]) => value !== "local").map(([key]) => key),
  );
  if (arterial.size === 0) return;
  const components = floodComponents(classes.keys());
  const arterialComponent = components.find((component) =>
    component.some((key) => arterial.has(key)),
  );
  if (!arterialComponent) return;
  const backbone = new Set(arterialComponent);
  for (const component of components) {
    if (component === arterialComponent) continue;
    let best: { from: Point; to: Point; distance: number } | undefined;
    for (const key of component) {
      const from = parsePointKey(key);
      for (const target of backbone) {
        const to = parsePointKey(target);
        const distance = Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]);
        if (!best || distance < best.distance) best = { from, to, distance };
      }
    }
    if (!best || best.distance > 16) {
      for (const key of component) classes.delete(key);
      continue;
    }
    const corridor = walkAxis(
      best.from,
      best.to,
      Math.abs(best.to[0] - best.from[0]) >= Math.abs(best.to[1] - best.from[1]),
    );
    for (const point of corridor) {
      if (!inBounds(size, point)) continue;
      if (mask[indexOf(size, point[0], point[1])] || classes.has(pointKey(point))) {
        paintClass(classes, point, "local");
        backbone.add(pointKey(point));
      }
    }
  }
}

export function pruneInternalDeadEnds(
  classes: Map<string, RoadClass>,
  gateKeys: ReadonlySet<string>,
): void {
  let changed = true;
  while (changed) {
    changed = false;
    const occupied = occupiedSet(classes);
    const mates = pairLaneMates(classes);
    for (const key of [...classes.keys()].sort()) {
      if (gateKeys.has(key)) continue;
      const point = parsePointKey(key);
      if (logicalConnections(point, occupied, mates).length <= 1) {
        if (isLiveCarriagewayShoulder(point, occupied, mates)) continue;
        classes.delete(key);
        changed = true;
      }
    }
  }
}

export function expandGateKeys(gateKeys: ReadonlySet<string>, mates: LaneMates): Set<string> {
  const expanded = new Set(gateKeys);
  for (const key of gateKeys) {
    const mate = mates.get(key);
    if (mate) expanded.add(mate);
  }
  return expanded;
}

function freeRegions(
  size: number,
  mask: readonly boolean[],
  classes: ReadonlyMap<string, RoadClass>,
): Point[][] {
  const free: Point[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (mask[indexOf(size, x, y)] && !classes.has(pointKey([x, y]))) free.push([x, y]);
    }
  }
  const remaining = new Map(free.map((point) => [pointKey(point), point]));
  const regions: Point[][] = [];
  for (const start of free) {
    if (!remaining.delete(pointKey(start))) continue;
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      const point = queue[index];
      if (!point) continue;
      for (const { key } of neighborKeys(point)) {
        const found = remaining.get(key);
        if (found) {
          remaining.delete(key);
          queue.push(found);
        }
      }
    }
    regions.push(queue);
  }
  return regions;
}

function chooseSpacedCut(coords: readonly number[]): number | undefined {
  const unique = [...new Set(coords)].sort((left, right) => left - right);
  const lo = unique[0];
  const hi = unique[unique.length - 1];
  if (lo === undefined || hi === undefined) return undefined;
  if (hi - lo + 1 < MIN_MANZANA_SPAN * 2 + 1) return undefined;
  const mid = lo + Math.floor((hi - lo) / 2);
  const candidates = unique.filter(
    (value) => value - lo >= MIN_MANZANA_SPAN && hi - value >= MIN_MANZANA_SPAN,
  );
  candidates.sort((left, right) => Math.abs(left - mid) - Math.abs(right - mid));
  return candidates[0];
}

function regionSignature(region: readonly Point[]): string {
  const xs = region.map(([x]) => x);
  const ys = region.map(([, y]) => y);
  return `${Math.min(...xs)},${Math.max(...xs)},${Math.min(...ys)},${Math.max(...ys)},${region.length}`;
}

export function subdivideLargeVoids(
  size: number,
  mask: readonly boolean[],
  classes: Map<string, RoadClass>,
  maxSpan = 14,
): void {
  const skipped = new Set<string>();
  for (let guard = 0; guard < 24; guard += 1) {
    const regions = freeRegions(size, mask, classes).sort(
      (left, right) => right.length - left.length,
    );
    const oversized = regions.find((region) => {
      if (skipped.has(regionSignature(region))) return false;
      const xs = region.map(([x]) => x);
      const ys = region.map(([, y]) => y);
      return (
        Math.max(...xs) - Math.min(...xs) + 1 > maxSpan ||
        Math.max(...ys) - Math.min(...ys) + 1 > maxSpan
      );
    });
    if (!oversized) return;
    const xs = oversized.map(([x]) => x);
    const ys = oversized.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs) + 1;
    const height = Math.max(...ys) - Math.min(...ys) + 1;
    const vertical = width >= height;
    const cut = chooseSpacedCut(vertical ? xs : ys);
    if (cut === undefined) {
      skipped.add(regionSignature(oversized));
      continue;
    }
    const regionKeys = new Set(oversized.map(pointKey));
    for (const [x, y] of oversized) {
      if ((vertical && x === cut) || (!vertical && y === cut)) paintClass(classes, [x, y], "local");
    }
    // Extend the cut to existing roads so the new street does not float.
    const samples = oversized.filter(([x, y]) => (vertical ? x === cut : y === cut));
    const sample = samples[0];
    if (sample) {
      const dir: Cardinal = vertical ? "north" : "west";
      const opposite: Cardinal = vertical ? "south" : "east";
      for (const heading of [dir, opposite]) {
        let cursor: Point = [...sample];
        for (let step = 0; step < size; step += 1) {
          cursor = [
            cursor[0] + DIRECTION_DELTA[heading][0],
            cursor[1] + DIRECTION_DELTA[heading][1],
          ];
          if (!inBounds(size, cursor)) break;
          if (classes.has(pointKey(cursor))) break;
          if (!mask[indexOf(size, cursor[0], cursor[1])] && !regionKeys.has(pointKey(cursor)))
            break;
          paintClass(classes, cursor, "local");
        }
      }
    }
  }
}

export interface MeshNode {
  id: string;
  position: Point;
  kind: "gate" | "district" | "junction";
}

export interface MeshEdge {
  from: string;
  to: string;
  cells: Point[];
  roadClass: RoadClass;
}

function highestClass(keys: readonly string[], classes: ReadonlyMap<string, RoadClass>): RoadClass {
  let best: RoadClass = "local";
  for (const key of keys) {
    const value = classes.get(key);
    if (value && CLASS_RANK[value] > CLASS_RANK[best]) best = value;
  }
  return best;
}

export function rebuildRoadGraph(
  classes: ReadonlyMap<string, RoadClass>,
  seeds: readonly MeshNode[],
  _mates: LaneMates = pairLaneMates(classes),
): { nodes: MeshNode[]; edges: MeshEdge[] } {
  const occupied = occupiedSet(classes);
  const nodes = seeds.map((node) => ({ ...node, position: [...node.position] as Point }));
  const at = new Map(nodes.map((node) => [pointKey(node.position), node]));
  let junctionIndex = 0;
  for (const key of [...occupied].sort()) {
    const point = parsePointKey(key);
    const degree = neighborKeys(point).filter(({ key: next }) => occupied.has(next)).length;
    if (degree === 2) continue;
    if (at.has(key)) continue;
    if (degree < 2) continue;
    const node: MeshNode = {
      id: deriveProceduralId("junction", junctionIndex),
      position: point,
      kind: "junction",
    };
    junctionIndex += 1;
    nodes.push(node);
    at.set(key, node);
  }

  const edges: MeshEdge[] = [];
  const used = new Set<string>();
  const undirected = (left: string, right: string) =>
    left < right ? `${left}|${right}` : `${right}|${left}`;

  for (const node of nodes) {
    const startKey = pointKey(node.position);
    for (const { key: nextKey, point: next } of neighborKeys(node.position).filter(({ key }) =>
      occupied.has(key),
    )) {
      const mark = undirected(startKey, nextKey);
      if (used.has(mark)) continue;
      used.add(mark);
      const cells: Point[] = [[...node.position]];
      let previous = startKey;
      let current = nextKey;
      let currentPoint = next;
      while (true) {
        cells.push([...currentPoint]);
        if (at.has(current) && current !== startKey) break;
        const options = neighborKeys(currentPoint).filter(
          ({ key }) => occupied.has(key) && key !== previous,
        );
        const step = options[0];
        if (!step || options.length !== 1) break;
        used.add(undirected(current, step.key));
        previous = current;
        current = step.key;
        currentPoint = step.point;
      }
      const end = at.get(current);
      if (!end || end.id === node.id) continue;
      if (cells.length < 2) continue;
      edges.push({
        from: node.id,
        to: end.id,
        cells,
        roadClass: highestClass(cells.map(pointKey), classes),
      });
    }
  }

  const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  return {
    nodes: nodes.filter((node) => node.kind !== "junction" || connected.has(node.id)),
    edges,
  };
}
