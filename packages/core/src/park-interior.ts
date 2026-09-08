import type { CityDocumentV1, CityEntity, ZoneType } from "./domain.js";
import { deriveProceduralId } from "./ids.js";
import type { PlacementAsset } from "./placement-assets.js";
import type { SeededRandom } from "./rng.js";
import {
  CARDINALS,
  type Cardinal,
  DIRECTION_DELTA,
  occupiedRoadSet,
  type Point,
  pointKey,
} from "./road-tiles.js";
import {
  aabbFor,
  cellCenter,
  clusterCount,
  freeYaw,
  occupantJitter,
  type ScatterAabb,
  type ScatterSample,
  SPARSE_CHANCE,
  scatterRadius,
  tryScatterPoint,
} from "./scatter-cell.js";
import { isPocketParkBlock, sidewalkKeySet } from "./sidewalks.js";
import type { SpatialHash } from "./spatial-hash.js";
import { isCurbClassNonObstacle } from "./street-furniture.js";

const key = pointKey;
const ordered = (a: Point, b: Point) => a[1] - b[1] || a[0] - b[0];

export const PARK_STATUE_ASSETS = [
  "nature:statue_obelisk",
  "nature:statue_column",
  "nature:statue_ring",
  "nature:statue_head",
  "nature:statue_block",
] as const;

export const PARK_TREE_ASSETS = [
  "nature:tree_default",
  "nature:tree_oak",
  "nature:tree_simple",
  "nature:tree_tall",
  "nature:tree_small",
  "nature:tree_thin",
  "nature:tree_fat",
  "nature:tree_cone",
  "nature:tree_detailed",
  "nature:tree_pineDefaultA",
  "nature:tree_pineRoundA",
  "nature:tree_pineSmallA",
  "nature:tree_pineTallA",
  "suburban:tree-large",
  "suburban:tree-small",
] as const;

export const PARK_PATH_ASSETS = [
  "suburban:path-short",
  "suburban:path-stones-short",
  "suburban:path-stones-messy",
] as const;

export const PARK_CLUSTER_ASSETS = [
  "nature:flower_redA",
  "nature:flower_redB",
  "nature:flower_redC",
  "nature:flower_yellowA",
  "nature:flower_yellowB",
  "nature:flower_yellowC",
  "nature:flower_purpleA",
  "nature:flower_purpleB",
  "nature:flower_purpleC",
  "nature:grass",
  "nature:grass_large",
  "nature:grass_leafs",
  "nature:grass_leafsLarge",
  "nature:plant_bushSmall",
  "nature:plant_flatShort",
] as const;

export const PARK_SPARSE_ASSETS = ["nature:pot_small", "nature:sign"] as const;

export const PARK_GARNISH_ASSETS = [...PARK_CLUSTER_ASSETS, ...PARK_SPARSE_ASSETS] as const;

export const PARK_PLANTER_ASSETS = ["suburban:planter", "nature:pot_large"] as const;

const PARK_SHARED_ASSETS: ReadonlySet<string> = new Set([
  ...PARK_PATH_ASSETS,
  ...PARK_GARNISH_ASSETS,
]);

export function isParkSharedCellAsset(assetId: string, zone?: string | null): boolean {
  return zone === "park" && PARK_SHARED_ASSETS.has(assetId);
}

export function isPedestrianNonObstacle(entity: CityEntity): boolean {
  return isCurbClassNonObstacle(entity) || isParkSharedCellAsset(entity.assetId, entity.zone);
}

function add(point: Point, direction: Cardinal): Point {
  const [dx, dy] = DIRECTION_DELTA[direction];
  return [point[0] + dx, point[1] + dy];
}

function shuffled<T>(items: readonly T[], random: SeededRandom): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = random.integer(0, index);
    const current = copy[index];
    const other = copy[swap];
    if (current === undefined || other === undefined) continue;
    copy[index] = other;
    copy[swap] = current;
  }
  return copy;
}

function pickId(
  ids: readonly string[],
  catalog: Map<string, PlacementAsset>,
  random: SeededRandom,
): PlacementAsset | undefined {
  const available = ids.filter((id) => catalog.has(id));
  if (!available.length) return undefined;
  const chosen = available[random.integer(0, available.length - 1)];
  return chosen ? catalog.get(chosen) : undefined;
}

function createParkEntity(
  document: CityDocumentV1,
  index: number,
  asset: PlacementAsset,
  position: Point,
  yaw: number,
  refs: {
    districtId: string | null;
    blockId: string | null;
    lotId: string | null;
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
    lotId: refs.lotId,
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
    zoneCompatibilityWarning: Boolean(refs.zone && !asset.compatibleZones.includes(refs.zone)),
  };
}

interface ParkPlacer {
  document: CityDocumentV1;
  catalog: Map<string, PlacementAsset>;
  hash: SpatialHash;
  entities: CityEntity[];
  indexOffset: number;
  random: SeededRandom;
  sidewalks: ReadonlySet<string>;
  roads: ReadonlySet<string>;
  lotsByCell: Map<string, string>;
  occupants: Map<string, ScatterAabb>;
}

function refsFor(placer: ParkPlacer, block: CityDocumentV1["blocks"][number], cell: Point) {
  return {
    districtId: block.districtId,
    blockId: block.id,
    lotId: placer.lotsByCell.get(key(cell)) ?? null,
    zone: block.zone,
  };
}

function pushEntity(
  placer: ParkPlacer,
  asset: PlacementAsset,
  cell: Point,
  position: Point,
  yaw: number,
  block: CityDocumentV1["blocks"][number],
  occupy: boolean,
): boolean {
  if (placer.roads.has(key(cell)) || placer.sidewalks.has(key(cell))) return false;
  if (occupy && placer.hash.has(cell)) return false;
  if (occupy && !placer.hash.occupy([cell], `park:${placer.entities.length}`)) return false;
  placer.entities.push(
    createParkEntity(
      placer.document,
      placer.indexOffset + placer.entities.length,
      asset,
      position,
      yaw,
      refsFor(placer, block, cell),
    ),
  );
  if (occupy) placer.occupants.set(key(cell), aabbFor(position, asset.footprint, yaw));
  return true;
}

function flood(starts: readonly Point[], walkable: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>();
  const queue = [...starts];
  for (const start of starts) {
    const startKey = key(start);
    if (walkable.has(startKey)) seen.add(startKey);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    if (!cell) continue;
    for (const direction of CARDINALS) {
      const next = add(cell, direction);
      const nextKey = key(next);
      if (!walkable.has(nextKey) || seen.has(nextKey)) continue;
      seen.add(nextKey);
      queue.push(next);
    }
  }
  return seen;
}

function sidewalkEntries(
  interior: readonly Point[],
  sidewalks: ReadonlySet<string>,
  open: ReadonlySet<string>,
): Point[] {
  return interior.filter((cell) => {
    if (!open.has(key(cell))) return false;
    return CARDINALS.some((direction) => sidewalks.has(key(add(cell, direction))));
  });
}

function walkableIf(
  interiorCells: readonly Point[],
  hash: SpatialHash,
  extraOccupied?: Point,
): Set<string> {
  const open = new Set<string>();
  const extra = extraOccupied ? key(extraOccupied) : "";
  for (const cell of interiorCells) {
    if (hash.has(cell) || key(cell) === extra) continue;
    open.add(key(cell));
  }
  return open;
}

function stillConnected(
  interiorCells: readonly Point[],
  sidewalks: ReadonlySet<string>,
  hash: SpatialHash,
  required: readonly Point[],
  extraOccupied?: Point,
): boolean {
  const open = walkableIf(interiorCells, hash, extraOccupied);
  const entries = sidewalkEntries(interiorCells, sidewalks, open);
  if (!entries.length) return false;
  const reached = flood(entries, open);
  return required.every((cell) => !open.has(key(cell)) || reached.has(key(cell)));
}

function nearestCell(cells: readonly Point[], target: Point): Point | undefined {
  return [...cells].sort(
    (left, right) =>
      (left[0] - target[0]) ** 2 +
        (left[1] - target[1]) ** 2 -
        ((right[0] - target[0]) ** 2 + (right[1] - target[1]) ** 2) || ordered(left, right),
  )[0];
}

function pathTowardSidewalk(
  start: Point,
  direction: Cardinal,
  interior: ReadonlySet<string>,
  sidewalks: ReadonlySet<string>,
): Point[] {
  const cells: Point[] = [];
  let cursor = add(start, direction);
  while (interior.has(key(cursor))) {
    cells.push(cursor);
    if (CARDINALS.some((cardinal) => sidewalks.has(key(add(cursor, cardinal))))) break;
    cursor = add(cursor, direction);
  }
  return cells;
}

function pushGarnish(
  placer: ParkPlacer,
  asset: PlacementAsset,
  cell: Point,
  position: Point,
  yaw: number,
  block: CityDocumentV1["blocks"][number],
  placed: ScatterSample[],
): void {
  if (!pushEntity(placer, asset, cell, position, yaw, block, false)) return;
  placed.push({ position, radius: scatterRadius(asset.footprint) });
}

function garnishCell(
  placer: ParkPlacer,
  block: CityDocumentV1["blocks"][number],
  cell: Point,
  chance: number,
): void {
  if (placer.random.float() > chance) return;
  const blockers: ScatterAabb[] = [];
  const occupant = placer.occupants.get(key(cell));
  if (occupant) blockers.push(occupant);
  const placed: ScatterSample[] = [];
  if (placer.random.float() < SPARSE_CHANCE) {
    const sparse = pickId(PARK_SPARSE_ASSETS, placer.catalog, placer.random);
    if (sparse) {
      const position = tryScatterPoint(cell, sparse.footprint, placer.random, blockers, placed);
      if (position) {
        pushGarnish(
          placer,
          sparse,
          cell,
          position,
          placer.random.integer(0, 3) * 90,
          block,
          placed,
        );
      }
    }
  }
  const count = clusterCount(placer.document.generator.parameters.decorationDensity);
  for (let index = 0; index < count; index += 1) {
    const cluster = pickId(PARK_CLUSTER_ASSETS, placer.catalog, placer.random);
    if (!cluster) continue;
    const position = tryScatterPoint(cell, cluster.footprint, placer.random, blockers, placed);
    if (!position) continue;
    pushGarnish(placer, cluster, cell, position, freeYaw(placer.random), block, placed);
  }
}

function composePlaza(
  placer: ParkPlacer,
  block: CityDocumentV1["blocks"][number],
  interiorCells: Point[],
): string | null {
  const interior = new Set(interiorCells.map(key));
  const cx = interiorCells.reduce((sum, cell) => sum + cell[0], 0) / interiorCells.length;
  const cz = interiorCells.reduce((sum, cell) => sum + cell[1], 0) / interiorCells.length;
  const center = nearestCell(interiorCells, [cx, cz]);
  const pathKeys = new Set<string>();
  if (!center) return null;
  const statue = pickId(PARK_STATUE_ASSETS, placer.catalog, placer.random);
  let statueKey: string | null = null;
  if (statue) {
    if (
      pushEntity(
        placer,
        statue,
        center,
        cellCenter(center),
        placer.random.integer(0, 3) * 90,
        block,
        true,
      )
    ) {
      statueKey = key(center);
    }
  }
  const pathCells: Point[] = [];
  for (const direction of CARDINALS) {
    const strip = pathTowardSidewalk(center, direction, interior, placer.sidewalks);
    const path = pickId(PARK_PATH_ASSETS, placer.catalog, placer.random);
    const yaw = direction === "east" || direction === "west" ? 90 : 0;
    for (const cell of strip) {
      if (!path) break;
      if (pushEntity(placer, path, cell, cellCenter(cell), yaw, block, false)) {
        pathCells.push(cell);
        pathKeys.add(key(cell));
      }
    }
  }
  const decoration = placer.document.generator.parameters.decorationDensity;
  const planterChance = 0.22 + decoration / 280;
  const planter = pickId(PARK_PLANTER_ASSETS, placer.catalog, placer.random);
  for (const cell of pathCells) {
    if (!planter || placer.random.float() > planterChance) continue;
    const side = CARDINALS[placer.random.integer(0, 3)];
    if (!side) continue;
    const neighbor = add(cell, side);
    if (!interior.has(key(neighbor)) || pathKeys.has(key(neighbor))) continue;
    if (!stillConnected(interiorCells, placer.sidewalks, placer.hash, pathCells, neighbor))
      continue;
    const yaw = placer.random.integer(0, 3) * 90;
    pushEntity(
      placer,
      planter,
      neighbor,
      occupantJitter(neighbor, planter.footprint, placer.random),
      yaw,
      block,
      true,
    );
  }
  const treeChance = 0.16 + decoration / 400;
  const required = pathCells;
  for (const cell of shuffled(interiorCells, placer.random)) {
    if (placer.hash.has(cell) || pathKeys.has(key(cell))) continue;
    if (placer.random.float() > treeChance) continue;
    const tree = pickId(PARK_TREE_ASSETS, placer.catalog, placer.random);
    if (!tree) continue;
    if (!stillConnected(interiorCells, placer.sidewalks, placer.hash, required, cell)) continue;
    pushEntity(
      placer,
      tree,
      cell,
      occupantJitter(cell, tree.footprint, placer.random),
      freeYaw(placer.random),
      block,
      true,
    );
  }
  return statueKey;
}

function composeGrove(
  placer: ParkPlacer,
  block: CityDocumentV1["blocks"][number],
  cells: Point[],
): void {
  const treeCell = shuffled(cells, placer.random)[0];
  const tree = pickId(PARK_TREE_ASSETS, placer.catalog, placer.random);
  if (tree && treeCell) {
    pushEntity(
      placer,
      tree,
      treeCell,
      occupantJitter(treeCell, tree.footprint, placer.random),
      freeYaw(placer.random),
      block,
      true,
    );
  }
  const decoration = placer.document.generator.parameters.decorationDensity;
  const garnishChance = 0.45 + decoration / 220;
  for (const cell of cells) garnishCell(placer, block, cell, garnishChance);
}

function garnishPlaza(
  placer: ParkPlacer,
  block: CityDocumentV1["blocks"][number],
  interiorCells: Point[],
  statueKey: string | null,
): void {
  const decoration = placer.document.generator.parameters.decorationDensity;
  const chance = 0.4 + decoration / 200;
  for (const cell of interiorCells) {
    if (statueKey && key(cell) === statueKey) continue;
    garnishCell(placer, block, cell, chance);
  }
}

/** GEN-032: civic plazas in habitable parks and groves in pocket remnants. */
export function placeParkInteriors(
  document: CityDocumentV1,
  assets: readonly PlacementAsset[],
  random: SeededRandom,
  hash: SpatialHash,
  indexOffset = 0,
): CityEntity[] {
  const catalog = new Map(assets.map((asset) => [asset.id, asset]));
  const sidewalks = sidewalkKeySet(document);
  const roads = occupiedRoadSet(document.roadGraph.cells);
  const lotsByCell = new Map<string, string>();
  for (const lot of document.lots) {
    for (const cell of lot.cells) lotsByCell.set(key(cell), lot.id);
  }
  const placer: ParkPlacer = {
    document,
    catalog,
    hash,
    entities: [],
    indexOffset,
    random,
    sidewalks,
    roads,
    lotsByCell,
    occupants: new Map(),
  };
  for (const block of [...document.blocks].sort(
    (left, right) =>
      left.id.localeCompare(right.id) || (left.cells[0]?.[1] ?? 0) - (right.cells[0]?.[1] ?? 0),
  )) {
    if (block.zone !== "park") continue;
    const cells = [...block.cells].sort(ordered);
    if (isPocketParkBlock(block.cells, roads)) {
      composeGrove(placer, block, cells);
      continue;
    }
    const interiorCells = cells.filter((cell) => !sidewalks.has(key(cell)));
    if (!interiorCells.length) {
      composeGrove(placer, block, cells);
      continue;
    }
    const statueKey = composePlaza(placer, block, interiorCells);
    garnishPlaza(placer, block, interiorCells, statueKey);
  }
  return placer.entities;
}
