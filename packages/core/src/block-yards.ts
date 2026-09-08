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
import { cellCenter, freeYaw, occupantJitter } from "./scatter-cell.js";
import { sidewalkKeySet } from "./sidewalks.js";
import type { SpatialHash } from "./spatial-hash.js";

const key = pointKey;
const ordered = (a: Point, b: Point) => a[1] - b[1] || a[0] - b[0];
const POCKET_COURTYARD_MAX = 4;

export const YARD_ZONES: ReadonlySet<ZoneType> = new Set(["suburban", "urban"]);

export const YARD_TREE_SMALL = "suburban:tree-small";
export const YARD_TREE_LARGE = "suburban:tree-large";
export const YARD_PLANTER = "suburban:planter";
export const YARD_PATH = "suburban:path-short";
export const YARD_FENCE = "suburban:fence-low";
export const YARD_DUMPSTER = "roads:dumpster";

export const YARD_ALLOWLIST: ReadonlySet<string> = new Set([
  YARD_TREE_SMALL,
  YARD_TREE_LARGE,
  YARD_PLANTER,
  YARD_PATH,
  YARD_FENCE,
  YARD_DUMPSTER,
]);

type Lot = CityDocumentV1["lots"][number];
type Block = CityDocumentV1["blocks"][number];

export function isYardZone(zone: ZoneType | null | undefined): zone is "suburban" | "urban" {
  return zone != null && YARD_ZONES.has(zone);
}

export function isLotYardDumpster(entity: CityEntity, sidewalks: ReadonlySet<string>): boolean {
  if (entity.assetId !== YARD_DUMPSTER) return false;
  if (!entity.lotId || !isYardZone(entity.zone)) return false;
  const x = Math.floor(entity.transform.position[0] ?? 0);
  const z = Math.floor(entity.transform.position[2] ?? 0);
  return !sidewalks.has(key([x, z]));
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

function createYardEntity(
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

interface YardPlacer {
  document: CityDocumentV1;
  catalog: Map<string, PlacementAsset>;
  hash: SpatialHash;
  entities: CityEntity[];
  indexOffset: number;
  random: SeededRandom;
  sidewalks: ReadonlySet<string>;
  roads: ReadonlySet<string>;
}

function decorationOf(placer: YardPlacer): number {
  return placer.document.generator.parameters.decorationDensity;
}

function pushOccupant(
  placer: YardPlacer,
  assetId: string,
  cell: Point,
  position: Point,
  yaw: number,
  refs: {
    districtId: string | null;
    blockId: string | null;
    lotId: string | null;
    zone: ZoneType | null;
  },
): boolean {
  if (placer.roads.has(key(cell)) || placer.sidewalks.has(key(cell))) return false;
  if (placer.hash.has(cell)) return false;
  const asset = placer.catalog.get(assetId);
  if (!asset) return false;
  if (!placer.hash.occupy([cell], `yard:${placer.entities.length}`)) return false;
  placer.entities.push(
    createYardEntity(
      placer.document,
      placer.indexOffset + placer.entities.length,
      asset,
      position,
      yaw,
      refs,
    ),
  );
  return true;
}

function refsFor(block: Block, lotId: string | null) {
  return {
    districtId: block.districtId,
    blockId: block.id,
    lotId,
    zone: block.zone,
  };
}

function sidewalkAdjacent(cell: Point, sidewalks: ReadonlySet<string>): boolean {
  return CARDINALS.some((direction) => sidewalks.has(key(add(cell, direction))));
}

function onFrontRow(cell: Point, frontage: Cardinal, sidewalks: ReadonlySet<string>): boolean {
  return sidewalks.has(key(add(cell, frontage)));
}

function lotBounds(lot: Lot) {
  const xs = lot.cells.map(([x]) => x);
  const ys = lot.cells.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function isRearRow(cell: Point, lot: Lot): boolean {
  const bounds = lotBounds(lot);
  if (lot.frontage === "south") return cell[1] === bounds.minY;
  if (lot.frontage === "north") return cell[1] === bounds.maxY;
  if (lot.frontage === "east") return cell[0] === bounds.minX;
  return cell[0] === bounds.maxX;
}

function isSideOrBackEdge(
  cell: Point,
  lot: Lot,
  lotSet: ReadonlySet<string>,
  sidewalks: ReadonlySet<string>,
): boolean {
  if (onFrontRow(cell, lot.frontage, sidewalks)) return false;
  return CARDINALS.some((direction) => !lotSet.has(key(add(cell, direction))));
}

function fenceYaw(cell: Point, lotSet: ReadonlySet<string>): number {
  const east = lotSet.has(key(add(cell, "east")));
  const west = lotSet.has(key(add(cell, "west")));
  if (!east || !west) return 90;
  return 0;
}

/** Rear-inner inset: opposite frontage, then north-east within remaining slack. */
export function rearInsetPosition(
  cell: Point,
  footprint: { width: number; depth: number },
  frontage: Cardinal,
): Point {
  const inset = 0.04;
  const slackX = Math.max(0, 0.5 - footprint.width / 2 - inset);
  const slackZ = Math.max(0, 0.5 - footprint.depth / 2 - inset);
  let x = cell[0] + 0.5;
  let z = cell[1] + 0.5;
  if (frontage === "south") z -= slackZ;
  if (frontage === "north") z += slackZ;
  if (frontage === "east") x -= slackX;
  if (frontage === "west") x += slackX;
  if (frontage === "south" || frontage === "north") x += slackX;
  else z -= slackZ;
  return [x, z];
}

function northEastFirst(left: Point, right: Point): number {
  return right[0] - left[0] || left[1] - right[1];
}

function rearCornerCell(free: readonly Point[], lot: Lot): Point | undefined {
  const rear = free.filter((cell) => isRearRow(cell, lot));
  const pool = rear.length ? rear : free;
  return [...pool].sort(northEastFirst)[0];
}

function composePocketGreen(
  placer: YardPlacer,
  block: Block,
  cells: Point[],
  lotId: string | null,
): void {
  const decoration = decorationOf(placer);
  const chance = 0.62 + decoration / 280;
  let planted = 0;
  for (const cell of shuffled(cells, placer.random)) {
    if (placer.hash.has(cell) || placer.random.float() > chance) continue;
    const useTree = placer.random.float() < 0.28;
    const assetId = useTree ? YARD_TREE_SMALL : YARD_PLANTER;
    const asset = placer.catalog.get(assetId);
    if (!asset) continue;
    if (
      pushOccupant(
        placer,
        assetId,
        cell,
        occupantJitter(cell, asset.footprint, placer.random),
        freeYaw(placer.random),
        refsFor(block, lotId),
      )
    ) {
      planted += 1;
    }
  }
  if (planted > 0) return;
  const fallback = cells.find((cell) => !placer.hash.has(cell));
  const planter = placer.catalog.get(YARD_PLANTER);
  if (!fallback || !planter) return;
  pushOccupant(
    placer,
    YARD_PLANTER,
    fallback,
    occupantJitter(fallback, planter.footprint, placer.random),
    freeYaw(placer.random),
    refsFor(block, lotId),
  );
}

function composeGrove(placer: YardPlacer, block: Block, cells: Point[]): void {
  const decoration = decorationOf(placer);
  const treeChance = 0.28 + decoration / 380;
  const planterChance = 0.32 + decoration / 260;
  let trees = 0;
  const target = Math.max(1, Math.min(cells.length - 1, Math.round(cells.length * treeChance)));
  for (const cell of shuffled(cells, placer.random)) {
    if (placer.hash.has(cell)) continue;
    if (trees >= target) break;
    const large = placer.random.float() < 0.45;
    const assetId = large ? YARD_TREE_LARGE : YARD_TREE_SMALL;
    const asset = placer.catalog.get(assetId);
    if (!asset) continue;
    if (
      pushOccupant(
        placer,
        assetId,
        cell,
        occupantJitter(cell, asset.footprint, placer.random),
        freeYaw(placer.random),
        refsFor(block, null),
      )
    ) {
      trees += 1;
    }
  }
  if (trees === 0) {
    const fallback = cells.find((cell) => !placer.hash.has(cell));
    const tree = placer.catalog.get(YARD_TREE_SMALL);
    if (fallback && tree) {
      pushOccupant(
        placer,
        YARD_TREE_SMALL,
        fallback,
        occupantJitter(fallback, tree.footprint, placer.random),
        freeYaw(placer.random),
        refsFor(block, null),
      );
    }
  }
  for (const cell of cells) {
    if (placer.hash.has(cell) || placer.random.float() > planterChance) continue;
    const planter = placer.catalog.get(YARD_PLANTER);
    if (!planter) continue;
    pushOccupant(
      placer,
      YARD_PLANTER,
      cell,
      occupantJitter(cell, planter.footprint, placer.random),
      placer.random.integer(0, 3) * 90,
      refsFor(block, null),
    );
  }
}

function composeLotYard(placer: YardPlacer, block: Block, lot: Lot): void {
  const lotSet = new Set(lot.cells.map(key));
  const free = lot.cells.filter((cell) => !placer.hash.has(cell));
  if (!free.length) return;
  const occupied = lot.cells.some((cell) => placer.hash.has(cell));
  const decoration = decorationOf(placer);
  if (occupied) {
    const dumpsterChance = 0.4 + decoration / 250;
    if (placer.random.float() < dumpsterChance) {
      const corner = rearCornerCell(free, lot);
      const dumpster = placer.catalog.get(YARD_DUMPSTER);
      if (corner && dumpster) {
        pushOccupant(
          placer,
          YARD_DUMPSTER,
          corner,
          rearInsetPosition(corner, dumpster.footprint, lot.frontage),
          placer.random.integer(0, 3) * 90,
          refsFor(block, lot.id),
        );
      }
    }
    const fenceChance = 0.22 + decoration / 320;
    for (const cell of shuffled(free, placer.random)) {
      if (placer.hash.has(cell)) continue;
      if (!isSideOrBackEdge(cell, lot, lotSet, placer.sidewalks)) continue;
      if (placer.random.float() > fenceChance) continue;
      const fence = placer.catalog.get(YARD_FENCE);
      if (!fence) continue;
      pushOccupant(
        placer,
        YARD_FENCE,
        cell,
        cellCenter(cell),
        fenceYaw(cell, lotSet),
        refsFor(block, lot.id),
      );
    }
  }
  const remaining = lot.cells.filter((cell) => !placer.hash.has(cell));
  if (!occupied) {
    composePocketGreen(placer, block, remaining, lot.id);
    return;
  }
  const fill = 0.22 + decoration / 220;
  for (const cell of shuffled(remaining, placer.random)) {
    if (placer.hash.has(cell) || placer.random.float() > fill) continue;
    const rear = !sidewalkAdjacent(cell, placer.sidewalks);
    if (rear && placer.random.float() < 0.22) {
      pushOccupant(
        placer,
        YARD_PATH,
        cell,
        cellCenter(cell),
        lot.frontage === "east" || lot.frontage === "west" ? 90 : 0,
        refsFor(block, lot.id),
      );
      continue;
    }
    const useTree = placer.random.float() < 0.45;
    const assetId = useTree ? YARD_TREE_SMALL : YARD_PLANTER;
    const asset = placer.catalog.get(assetId);
    if (!asset) continue;
    pushOccupant(
      placer,
      assetId,
      cell,
      occupantJitter(cell, asset.footprint, placer.random),
      freeYaw(placer.random),
      refsFor(block, lot.id),
    );
  }
}

/** GEN-033: suburban/urban courtyards and lot yards. */
export function placeBlockYards(
  document: CityDocumentV1,
  assets: readonly PlacementAsset[],
  random: SeededRandom,
  hash: SpatialHash,
  indexOffset = 0,
): CityEntity[] {
  const catalog = new Map(assets.map((asset) => [asset.id, asset]));
  const sidewalks = sidewalkKeySet(document);
  const roads = occupiedRoadSet(document.roadGraph.cells);
  const lotsByBlock = new Map<string, Lot[]>();
  const lotCells = new Set<string>();
  for (const lot of document.lots) {
    const list = lotsByBlock.get(lot.blockId) ?? [];
    list.push(lot);
    lotsByBlock.set(lot.blockId, list);
    for (const cell of lot.cells) lotCells.add(key(cell));
  }
  const placer: YardPlacer = {
    document,
    catalog,
    hash,
    entities: [],
    indexOffset,
    random,
    sidewalks,
    roads,
  };
  for (const block of [...document.blocks].sort(
    (left, right) =>
      left.id.localeCompare(right.id) || (left.cells[0]?.[1] ?? 0) - (right.cells[0]?.[1] ?? 0),
  )) {
    if (!isYardZone(block.zone)) continue;
    const courtyard = [...block.cells]
      .filter((cell) => !sidewalks.has(key(cell)) && !lotCells.has(key(cell)))
      .sort(ordered);
    if (courtyard.length > 0 && courtyard.length <= POCKET_COURTYARD_MAX) {
      composePocketGreen(placer, block, courtyard, null);
    } else if (courtyard.length > POCKET_COURTYARD_MAX) {
      composeGrove(placer, block, courtyard);
    }
    const lots = [...(lotsByBlock.get(block.id) ?? [])].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    for (const lot of lots) composeLotYard(placer, block, lot);
  }
  return placer.entities;
}
