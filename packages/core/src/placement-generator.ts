import type { CityDocumentV1, CityEntity, DensityLevel, ZoneType } from "./domain.js";
import { deriveProceduralId } from "./ids.js";
import { assetFitsZone, type PlacementAsset, usablePlacementAssets } from "./placement-assets.js";
import type { SeededRandom } from "./rng.js";
import { pointKey as cellKey, occupiedCellsForRoadTile, occupiedRoadSet } from "./road-tiles.js";
import { type GridPoint, SpatialHash } from "./spatial-hash.js";
import {
  curbFurnitureAabb,
  furnitureAabbsOverlap,
  isCurbFurnitureAsset,
} from "./street-furniture.js";

type Point = [number, number];
type Lot = CityDocumentV1["lots"][number];
type Block = CityDocumentV1["blocks"][number];

const FRONTAGE_YAW = {
  south: 0,
  west: 90,
  north: 180,
  east: 270,
} as const;

const DISTRICT_THEME_PALETTES: Record<string, readonly string[]> = {
  district: ["colormap", "variation-a", "variation-b"],
  warm: ["variation-a", "colormap"],
  cool: ["variation-b", "colormap"],
};

export function cellSpan(size: number): number {
  return Math.max(1, Math.round(size));
}

export function orientedSpan(
  width: number,
  depth: number,
  yaw: number,
): { alongX: number; alongZ: number } {
  const swap = yaw === 90 || yaw === 270;
  return {
    alongX: cellSpan(swap ? depth : width),
    alongZ: cellSpan(swap ? width : depth),
  };
}

export function occupiedCellsFor(entity: CityEntity): Point[] {
  const yaw = entity.transform.rotation[1] ?? 0;
  const { alongX, alongZ } = orientedSpan(entity.footprint.width, entity.footprint.depth, yaw);
  const minX = Math.round((entity.transform.position[0] ?? 0) - alongX / 2);
  const minZ = Math.round((entity.transform.position[2] ?? 0) - alongZ / 2);
  const cells: Point[] = [];
  for (let x = minX; x < minX + alongX; x += 1) {
    for (let z = minZ; z < minZ + alongZ; z += 1) cells.push([x, z]);
  }
  return cells;
}

export function occupancyFromRoads(document: CityDocumentV1): SpatialHash {
  const hash = new SpatialHash();
  for (const cell of document.roadGraph.cells) {
    hash.occupy(occupiedCellsForRoadTile(cell), `road:${cell.id}`);
  }
  for (const cell of document.sidewalks) {
    hash.occupy([cell.position], `sidewalk:${cell.id}`);
  }
  return hash;
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

function frontCells(
  bounds: ReturnType<typeof lotBounds>,
  frontage: Lot["frontage"],
  alongX: number,
  alongZ: number,
): Point[] | undefined {
  const lotW = bounds.maxX - bounds.minX + 1;
  const lotD = bounds.maxY - bounds.minY + 1;
  if (alongX > lotW || alongZ > lotD) return undefined;
  const startX =
    frontage === "east"
      ? bounds.maxX - alongX + 1
      : bounds.minX + (frontage === "west" ? 0 : Math.floor((lotW - alongX) / 2));
  const startY =
    frontage === "south"
      ? bounds.maxY - alongZ + 1
      : bounds.minY + (frontage === "north" ? 0 : Math.floor((lotD - alongZ) / 2));
  const cells: Point[] = [];
  for (let x = startX; x < startX + alongX; x += 1) {
    for (let y = startY; y < startY + alongZ; y += 1) cells.push([x, y]);
  }
  return cells;
}

export function occupancyRate(density: DensityLevel): number {
  if (density === "low") return 0.64;
  if (density === "high") return 0.98;
  if (density === "very-high") return 1;
  return 0.86;
}

export function parkVegetationChance(decorationDensity: number): number {
  return 0.55 + decorationDensity / 250;
}

export function decorationFillRate(decorationDensity: number): number {
  return 0.07 + (decorationDensity / 100) * 0.22;
}

export function placementWeight(
  asset: PlacementAsset,
  zone: ZoneType,
  density: DensityLevel,
): number {
  let weight = asset.proceduralWeight;
  const skyscraper = asset.id.includes("skyscraper");
  if (skyscraper) {
    if (density === "very-high" && (zone === "commercial" || zone === "urban")) weight *= 4.8;
    else if (density === "high" && (zone === "commercial" || zone === "urban")) weight *= 3.2;
    else if (density === "low") weight *= 0.12;
    else weight *= 0.65;
  }
  if (asset.pack === "suburban" && density === "very-high" && zone === "urban") weight *= 0.2;
  else if (asset.pack === "suburban" && density === "high" && zone === "urban") weight *= 0.4;
  if (asset.pack === "commercial" && density === "low") weight *= 0.5;
  return weight;
}

function pickAsset(
  candidates: readonly PlacementAsset[],
  random: SeededRandom,
  weightOf: (asset: PlacementAsset) => number,
): PlacementAsset | undefined {
  const weighted = candidates
    .map((asset) => ({ asset, weight: weightOf(asset) }))
    .filter((entry) => entry.weight > 0);
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return undefined;
  let cursor = random.float() * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.asset;
  }
  return weighted.at(-1)?.asset;
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

function isStandaloneProp(asset: PlacementAsset): boolean {
  if (asset.category === "building" || asset.category === "lod" || asset.category === "road") {
    return false;
  }
  const id = asset.id;
  if (
    id.includes("object") ||
    id.includes("hanging") ||
    id.includes("wires") ||
    id.includes("awning") ||
    id.includes("overhang")
  ) {
    return false;
  }
  return (
    asset.decoration ||
    asset.category === "infrastructure" ||
    asset.category === "vegetation" ||
    asset.category === "street-furniture"
  );
}

function createEntity(
  document: CityDocumentV1,
  index: number,
  asset: PlacementAsset,
  cells: readonly Point[],
  yaw: number,
  refs: {
    districtId: string | null;
    blockId: string | null;
    lotId: string | null;
    zone: ZoneType | null;
  },
): CityEntity {
  const minX = Math.min(...cells.map(([x]) => x));
  const maxX = Math.max(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  const maxY = Math.max(...cells.map(([, y]) => y));
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
      position: [(minX + maxX + 1) / 2, asset.verticalOffset, (minY + maxY + 1) / 2],
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
    zoneCompatibilityWarning: Boolean(refs.zone && !assetFitsZone(asset, refs.zone)),
  };
}

function tryPlace(
  document: CityDocumentV1,
  hash: SpatialHash,
  entities: CityEntity[],
  asset: PlacementAsset,
  cells: readonly Point[],
  yaw: number,
  refs: Parameters<typeof createEntity>[5],
  indexOffset = 0,
): boolean {
  if (cells.some((cell) => hash.has(cell))) return false;
  const entity = createEntity(document, indexOffset + entities.length, asset, cells, yaw, refs);
  if (!hash.occupy(cells, entity.id)) return false;
  entities.push(entity);
  return true;
}

function lotCellSet(lot: Lot): Set<string> {
  return new Set(lot.cells.map((cell) => cellKey(cell)));
}

/** GEN-009: footprint-valid buildings and park vegetation. */
export function placeBuildingsAndParks(
  document: CityDocumentV1,
  assets: readonly PlacementAsset[],
  random: SeededRandom,
  hash: SpatialHash,
): CityEntity[] {
  const usable = usablePlacementAssets(assets);
  const buildings = usable.filter((asset) => asset.category === "building");
  const trees = usable.filter((asset) => asset.category === "vegetation");
  const industrialProps = usable.filter(
    (asset) =>
      asset.pack === "industrial" &&
      isStandaloneProp(asset) &&
      (asset.category === "infrastructure" || asset.category === "decoration"),
  );
  const blocks = new Map(document.blocks.map((block) => [block.id, block]));
  const density = document.generator.parameters.density;
  const fill = occupancyRate(density);
  const entities: CityEntity[] = [];

  for (const lot of document.lots) {
    const block = blocks.get(lot.blockId);
    if (!block) continue;
    const refs = {
      districtId: block.districtId,
      blockId: block.id,
      lotId: lot.id,
      zone: block.zone,
    };
    const bounds = lotBounds(lot);
    const owned = lotCellSet(lot);

    if (block.zone === "park") {
      const chance = parkVegetationChance(document.generator.parameters.decorationDensity);
      for (const cell of lot.cells) {
        if (hash.has(cell) || random.float() > chance) continue;
        const tree = pickAsset(trees, random, (asset) => asset.proceduralWeight);
        if (tree) tryPlace(document, hash, entities, tree, [cell], 0, refs);
      }
      continue;
    }

    if (random.float() > fill) continue;
    const yaw = FRONTAGE_YAW[lot.frontage];
    const fitting = (pool: readonly PlacementAsset[]) =>
      pool.filter((asset) => {
        if (!assetFitsZone(asset, block.zone)) return false;
        const span = orientedSpan(asset.footprint.width, asset.footprint.depth, yaw);
        const cells = frontCells(bounds, lot.frontage, span.alongX, span.alongZ);
        return Boolean(cells?.every((cell) => owned.has(cellKey(cell)) && !hash.has(cell)));
      });
    const chosen =
      pickAsset(fitting(buildings), random, (asset) =>
        placementWeight(asset, block.zone, density),
      ) ??
      (block.zone === "industrial"
        ? pickAsset(fitting(industrialProps), random, (asset) => asset.proceduralWeight)
        : undefined);
    if (!chosen) continue;
    const span = orientedSpan(chosen.footprint.width, chosen.footprint.depth, yaw);
    const cells = frontCells(bounds, lot.frontage, span.alongX, span.alongZ);
    if (cells) tryPlace(document, hash, entities, chosen, cells, yaw, refs);
  }

  for (const block of document.blocks) {
    if (block.zone !== "park") continue;
    if (document.lots.some((lot) => lot.blockId === block.id)) continue;
    const chance = parkVegetationChance(document.generator.parameters.decorationDensity);
    const refs = {
      districtId: block.districtId,
      blockId: block.id,
      lotId: null,
      zone: block.zone,
    };
    let planted = 0;
    for (const cell of block.cells) {
      if (hash.has(cell) || random.float() > chance) continue;
      const tree = pickAsset(trees, random, (asset) => asset.proceduralWeight);
      if (tree && tryPlace(document, hash, entities, tree, [cell], 0, refs)) planted += 1;
    }
    if (planted === 0) {
      const tree = pickAsset(trees, random, (asset) => asset.proceduralWeight);
      for (const cell of block.cells) {
        if (!tree) break;
        if (tryPlace(document, hash, entities, tree, [cell], 0, refs)) break;
      }
    }
  }
  return entities;
}

function roadAdjacent(cell: Point, roads: ReadonlySet<string>): boolean {
  return (
    roads.has(cellKey([cell[0] + 1, cell[1]])) ||
    roads.has(cellKey([cell[0] - 1, cell[1]])) ||
    roads.has(cellKey([cell[0], cell[1] + 1])) ||
    roads.has(cellKey([cell[0], cell[1] - 1]))
  );
}

function propsForZone(
  zone: ZoneType,
  roadside: boolean,
  vegetation: readonly PlacementAsset[],
  furniture: readonly PlacementAsset[],
  industrial: readonly PlacementAsset[],
  suburban: readonly PlacementAsset[],
  commercial: readonly PlacementAsset[],
): PlacementAsset[] {
  if (roadside && furniture.length) return [...furniture];
  if (zone === "park") return [...vegetation, ...furniture];
  if (zone === "industrial") return [...industrial, ...furniture];
  if (zone === "suburban") return [...vegetation, ...suburban, ...furniture];
  if (zone === "commercial") return [...commercial, ...furniture];
  return [...vegetation, ...commercial, ...furniture];
}

/** GEN-010: district palettes plus unoccupied-cell decoration. */
export function applyDistrictThemes(document: CityDocumentV1): void {
  const palette =
    DISTRICT_THEME_PALETTES[document.generator.parameters.colorTheme] ??
    DISTRICT_THEME_PALETTES.district;
  document.districts.forEach((district, index) => {
    district.theme = palette?.[index % (palette.length || 1)] ?? "colormap";
  });
}

export function placeDecoration(
  document: CityDocumentV1,
  assets: readonly PlacementAsset[],
  random: SeededRandom,
  hash: SpatialHash,
  indexOffset = 0,
): CityEntity[] {
  const usable = usablePlacementAssets(assets).filter(isStandaloneProp);
  const vegetation = usable.filter((asset) => asset.category === "vegetation");
  const furniture: PlacementAsset[] = [];
  const industrial = usable.filter((asset) => asset.pack === "industrial");
  const suburban = usable.filter((asset) => asset.pack === "suburban" && asset.decoration);
  const commercial = usable.filter((asset) => asset.pack === "commercial" && asset.decoration);
  const roads = occupiedRoadSet(document.roadGraph.cells);
  const blockOf = new Map<string, Block>();
  for (const block of document.blocks) {
    for (const cell of block.cells) blockOf.set(cellKey(cell), block);
  }
  const candidates: Point[] = [];
  for (const block of document.blocks) {
    for (const cell of block.cells) {
      if (!hash.has(cell)) candidates.push(cell);
    }
  }
  const target = Math.round(
    candidates.length * decorationFillRate(document.generator.parameters.decorationDensity),
  );
  const entities: CityEntity[] = [];
  for (const cell of shuffled(candidates, random)) {
    if (entities.length >= target) break;
    if (hash.has(cell)) continue;
    const block = blockOf.get(cellKey(cell));
    if (!block) continue;
    const pool = propsForZone(
      block.zone,
      roadAdjacent(cell, roads),
      vegetation,
      furniture,
      industrial,
      suburban,
      commercial,
    ).filter((asset) => {
      if (!assetFitsZone(asset, block.zone)) return false;
      const yaw = 0;
      const span = orientedSpan(asset.footprint.width, asset.footprint.depth, yaw);
      return span.alongX === 1 && span.alongZ === 1;
    });
    const chosen = pickAsset(pool, random, (asset) => asset.proceduralWeight);
    if (!chosen) continue;
    const yaw = chosen.front === "omnidirectional" ? random.integer(0, 3) * 90 : 0;
    tryPlace(
      document,
      hash,
      entities,
      chosen,
      [cell],
      yaw,
      {
        districtId: block.districtId,
        blockId: block.id,
        lotId: null,
        zone: block.zone,
      },
      indexOffset,
    );
  }
  return entities;
}

function inMask(document: CityDocumentV1, [x, y]: GridPoint): boolean {
  const size = document.map.size;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) {
    return false;
  }
  return document.map.boundaryMask[y * size + x] === true;
}

/** GEN-011: complete catalog references, unique IDs, mask, and occupancy. */
export function validatePlacedCity(
  document: CityDocumentV1,
  assets: readonly PlacementAsset[],
): string[] {
  const issues: string[] = [];
  const catalogIds = new Set(assets.map((asset) => asset.id));
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const districts = new Set(document.districts.map((district) => district.id));
  const blocks = new Set(document.blocks.map((block) => block.id));
  const lots = new Set(document.lots.map((lot) => lot.id));
  const roads = occupiedRoadSet(document.roadGraph.cells);
  const sidewalks = new Set(document.sidewalks.map((cell) => cellKey(cell.position)));
  const hash = occupancyFromRoads(document);
  const seen = new Set<string>();
  const curbAabbs: ReturnType<typeof curbFurnitureAabb>[] = [];

  for (const cell of document.roadGraph.cells) {
    if (!catalogIds.has(cell.assetId)) issues.push(`road cell ${cell.id} has missing asset`);
  }
  for (const cell of document.sidewalks) {
    if (!catalogIds.has(cell.assetId)) issues.push(`sidewalk ${cell.id} has missing asset`);
  }
  for (const entity of Object.values(document.entities)) {
    if (seen.has(entity.id)) issues.push(`duplicate entity ID ${entity.id}`);
    seen.add(entity.id);
    if (!catalogIds.has(entity.assetId)) issues.push(`entity ${entity.id} has missing asset`);
    if (entity.districtId && !districts.has(entity.districtId)) {
      issues.push(`entity ${entity.id} has missing district`);
    }
    if (entity.blockId && !blocks.has(entity.blockId)) {
      issues.push(`entity ${entity.id} has missing block`);
    }
    if (entity.lotId && !lots.has(entity.lotId)) issues.push(`entity ${entity.id} has missing lot`);
    if (entity.footprint.width <= 0 || entity.footprint.depth <= 0) {
      issues.push(`entity ${entity.id} has an invalid footprint`);
    }
    const asset = byId.get(entity.assetId);
    if (
      entity.origin === "procedural" &&
      entity.zone &&
      asset &&
      !assetFitsZone(asset, entity.zone) &&
      !entity.zoneCompatibilityWarning
    ) {
      issues.push(`entity ${entity.id} is incompatible with its zone`);
    }
    if (isCurbFurnitureAsset(entity.assetId)) {
      const x = entity.transform.position[0] ?? 0;
      const z = entity.transform.position[2] ?? 0;
      const cell: Point = [Math.floor(x), Math.floor(z)];
      if (!inMask(document, cell) || roads.has(cellKey(cell)) || !sidewalks.has(cellKey(cell))) {
        issues.push(`entity ${entity.id} leaves the valid mask`);
      }
      const aabb = curbFurnitureAabb(entity);
      if (curbAabbs.some((other) => furnitureAabbsOverlap(aabb, other))) {
        issues.push(`overlapping procedural occupancy at ${cellKey(cell)}`);
      }
      curbAabbs.push(aabb);
      continue;
    }
    for (const cell of occupiedCellsFor(entity)) {
      if (!inMask(document, cell) || roads.has(cellKey(cell))) {
        issues.push(`entity ${entity.id} leaves the valid mask`);
      }
      if (!hash.occupy([cell], entity.id)) {
        issues.push(`overlapping procedural occupancy at ${cellKey(cell)}`);
      }
    }
  }
  if (!Object.keys(document.entities).length) issues.push("placement produced no entities");
  return issues;
}
