import type { CityDocumentV1 } from "./domain.js";
import { deriveProceduralId } from "./ids.js";
import {
  AVENUE_JUNCTION_TILES,
  CARDINALS,
  DIRECTION_DELTA,
  neighborKeys,
  occupiedCellsForRoadTile,
  occupiedRoadSet,
  PEDESTRIAN_PATH_TILES,
  type Point,
  parsePointKey,
  pointKey,
  SIDEWALK_ASSET_ID,
} from "./road-tiles.js";

type Sidewalk = CityDocumentV1["sidewalks"][number];
const key = pointKey;
const ordered = (a: Point, b: Point) => a[1] - b[1] || a[0] - b[0];

export function sidewalkKeySet(document: CityDocumentV1): Set<string> {
  return new Set(document.sidewalks.map((cell) => key(cell.position)));
}

export function isSidewalkCell(cell: Point, roads: ReadonlySet<string>) {
  return roads.has(key(cell))
    ? false
    : CARDINALS.some((direction) => {
        const [dx, dy] = DIRECTION_DELTA[direction];
        return roads.has(key([cell[0] + dx, cell[1] + dy]));
      });
}

/** True when every cell would be consumed by a 1-cell sidewalk ring. */
export function isPocketParkBlock(cells: readonly Point[], roads: ReadonlySet<string>): boolean {
  return cells.length > 0 && cells.every((cell) => isSidewalkCell(cell, roads));
}

/** SIM-008 / GEN-026: 1-cell ring on manzanas that still have an interior after the ring. */
export function createSidewalks(document: CityDocumentV1): Sidewalk[] {
  const roads = occupiedRoadSet(document.roadGraph.cells);
  const sidewalks: Sidewalk[] = [];
  for (const block of document.blocks) {
    if (isPocketParkBlock(block.cells, roads)) continue;
    for (const cell of [...block.cells].sort(ordered)) {
      if (!isSidewalkCell(cell, roads)) continue;
      sidewalks.push({
        id: deriveProceduralId(
          document.generator.version,
          document.generator.seed,
          document.generator.attempt,
          "sidewalk",
          sidewalks.length,
        ),
        blockId: block.id,
        position: [...cell],
        assetId: SIDEWALK_ASSET_ID,
        rotation: 0,
      });
    }
  }
  return sidewalks;
}

function roundaboutApproaches(origin: Point): Point[] {
  return [
    [origin[0] + 1, origin[1]],
    [origin[0] + 2, origin[1] + 1],
    [origin[0] + 1, origin[1] + 2],
    [origin[0], origin[1] + 1],
  ];
}

/** SIM-009 / GEN-028: path junctions, real avenue T/4-way, corner approaches, curves, and roundabout approaches. */
export function crossingCellSet(document: CityDocumentV1): Set<string> {
  const occupied = occupiedRoadSet(document.roadGraph.cells);
  const crossings = new Set<string>();

  for (const tile of document.roadGraph.cells) {
    if (tile.assetId === "roads:road-roundabout") {
      for (const cell of roundaboutApproaches(tile.position)) crossings.add(key(cell));
      continue;
    }
    if (
      tile.assetId === "roads:road-curve" ||
      tile.assetId === "roads:road-bend" ||
      tile.assetId === "roads:road-bend-sidewalk" ||
      PEDESTRIAN_PATH_TILES.has(tile.assetId) ||
      AVENUE_JUNCTION_TILES.has(tile.assetId)
    ) {
      for (const cell of occupiedCellsForRoadTile(tile)) {
        crossings.add(key(cell));
        if (tile.assetId === "roads:road-curve") continue;
        for (const neighbor of neighborKeys(cell)) {
          if (occupied.has(neighbor.key)) crossings.add(neighbor.key);
        }
      }
    }
  }

  for (const cell of document.sidewalks) {
    const roads = neighborKeys(cell.position).filter(({ key: neighbor }) => occupied.has(neighbor));
    if (roads.length < 2) continue;
    for (const road of roads) crossings.add(road.key);
    for (let i = 0; i < roads.length; i += 1) {
      for (let j = i + 1; j < roads.length; j += 1) {
        const first = roads[i];
        const second = roads[j];
        if (!first || !second) continue;
        const diagonal: Point = [
          cell.position[0] +
            DIRECTION_DELTA[first.direction][0] +
            DIRECTION_DELTA[second.direction][0],
          cell.position[1] +
            DIRECTION_DELTA[first.direction][1] +
            DIRECTION_DELTA[second.direction][1],
        ];
        if (occupied.has(key(diagonal))) crossings.add(key(diagonal));
      }
    }
  }

  return crossings;
}

const DIAGONALS: readonly Point[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** 4-connected walkable cells; sidewalk rings also step diagonally. */
export function pedestrianNeighbors(
  cell: Point,
  walkable: ReadonlySet<string>,
  sidewalks: ReadonlySet<string>,
): Point[] {
  const next = neighborKeys(cell)
    .filter(({ key: neighbor }) => walkable.has(neighbor))
    .map(({ point }) => point);
  if (!sidewalks.has(key(cell))) return next;
  for (const [dx, dy] of DIAGONALS) {
    const point: Point = [cell[0] + dx, cell[1] + dy];
    if (sidewalks.has(key(point)) && walkable.has(key(point))) next.push(point);
  }
  return next;
}

function walkableComponents(
  walkable: ReadonlySet<string>,
  sidewalks: ReadonlySet<string>,
): string[][] {
  const remaining = new Set(walkable);
  const groups: string[][] = [];
  for (const start of walkable) {
    if (!remaining.delete(start)) continue;
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (!current) continue;
      for (const neighbor of pedestrianNeighbors(parsePointKey(current), walkable, sidewalks)) {
        const neighborKey = key(neighbor);
        if (!remaining.delete(neighborKey)) continue;
        queue.push(neighborKey);
      }
    }
    groups.push(queue);
  }
  return groups;
}

function linkPedestrianComponents(
  walkable: Set<string>,
  sidewalks: ReadonlySet<string>,
  occupied: ReadonlySet<string>,
): void {
  for (let guard = 0; guard < 256; guard += 1) {
    const groups = walkableComponents(walkable, sidewalks).filter((group) =>
      group.some((cell) => sidewalks.has(cell)),
    );
    if (groups.length <= 1) return;
    const ranked = [...groups].sort((left, right) => right.length - left.length);
    const large = new Set(ranked[0]);
    const small = ranked[1];
    if (!small) return;
    let bridge: string | undefined;
    for (const cell of small) {
      for (const { key: neighbor } of neighborKeys(parsePointKey(cell))) {
        if (!occupied.has(neighbor) || walkable.has(neighbor)) continue;
        if (neighborKeys(parsePointKey(neighbor)).some(({ key: next }) => large.has(next))) {
          bridge = neighbor;
          break;
        }
      }
      if (bridge) break;
    }
    if (!bridge) {
      for (const cell of small) {
        for (const { key: first } of neighborKeys(parsePointKey(cell))) {
          if (!occupied.has(first) || walkable.has(first)) continue;
          for (const { key: second } of neighborKeys(parsePointKey(first))) {
            if (!occupied.has(second) || walkable.has(second)) continue;
            if (neighborKeys(parsePointKey(second)).some(({ key: next }) => large.has(next))) {
              walkable.add(first);
              bridge = second;
              break;
            }
          }
          if (bridge) break;
        }
        if (bridge) break;
      }
    }
    if (!bridge) return;
    walkable.add(bridge);
  }
}

export function pedestrianWalkableSet(document: CityDocumentV1): Set<string> {
  const sidewalks = sidewalkKeySet(document);
  const occupied = occupiedRoadSet(document.roadGraph.cells);
  const walkable = new Set(sidewalks);
  for (const cell of crossingCellSet(document)) walkable.add(cell);
  linkPedestrianComponents(walkable, sidewalks, occupied);
  return walkable;
}

/** TST-003: sidewalk identity, frontage geometry, and one pedestrian component. */
export function validateSidewalks(document: CityDocumentV1): string[] {
  const issues: string[] = [];
  const roads = occupiedRoadSet(document.roadGraph.cells);
  const blocks = new Map(document.blocks.map((block) => [block.id, new Set(block.cells.map(key))]));
  const ids = new Set<string>();
  const positions = new Set<string>();
  for (const cell of document.sidewalks) {
    if (ids.has(cell.id)) issues.push(`duplicate sidewalk ID ${cell.id}`);
    ids.add(cell.id);
    const cellKey = key(cell.position);
    if (positions.has(cellKey)) issues.push(`overlapping sidewalk cell ${cellKey}`);
    positions.add(cellKey);
    if (cell.assetId !== SIDEWALK_ASSET_ID) issues.push(`sidewalk ${cell.id} has invalid asset`);
    const owner = blocks.get(cell.blockId);
    if (!owner) issues.push(`sidewalk ${cell.id} has missing block`);
    else if (!owner.has(cellKey)) issues.push(`sidewalk ${cell.id} leaves its block`);
    if (roads.has(cellKey) || !isSidewalkCell(cell.position, roads)) {
      issues.push(`sidewalk ${cell.id} is not a road-adjacent ring cell`);
    }
  }
  for (const block of document.blocks) {
    if (isPocketParkBlock(block.cells, roads)) continue;
    for (const cell of block.cells) {
      if (!isSidewalkCell(cell, roads)) continue;
      if (!positions.has(key(cell))) issues.push(`missing sidewalk at ${key(cell)}`);
    }
  }
  const walkable = pedestrianWalkableSet(document);
  const sidewalks = sidewalkKeySet(document);
  const sidewalkGroups = walkableComponents(walkable, sidewalks).filter((group) =>
    group.some((cell) => sidewalks.has(cell)),
  );
  if (sidewalks.size > 0 && sidewalkGroups.length !== 1) {
    issues.push("pedestrian graph is disconnected");
  }
  return issues;
}
