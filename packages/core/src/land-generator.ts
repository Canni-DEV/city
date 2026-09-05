import { type CityDocumentV1, ZONE_TYPES, type ZoneType } from "./domain.js";
import { deriveProceduralId } from "./ids.js";
import { CARDINALS, DIRECTION_DELTA, occupiedRoadSet, type Point, pointKey } from "./road-tiles.js";
import { isPocketParkBlock, sidewalkKeySet } from "./sidewalks.js";

type Block = CityDocumentV1["blocks"][number];
type Lot = CityDocumentV1["lots"][number];
const DIRECTIONS = CARDINALS.map((name) => ({
  name,
  dx: DIRECTION_DELTA[name][0],
  dy: DIRECTION_DELTA[name][1],
}));
const key = pointKey;
const ordered = (a: Point, b: Point) => a[1] - b[1] || a[0] - b[0];

/** GEN-006: cardinal components, with stable row-major traversal. */
function components(points: Point[]): Point[][] {
  const remaining = new Map(points.map((point) => [key(point), point]));
  const result: Point[][] = [];
  for (const start of points) {
    if (!remaining.delete(key(start))) continue;
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      const point = queue[index];
      if (!point) continue;
      for (const { dx, dy } of DIRECTIONS) {
        const neighbor = remaining.get(key([point[0] + dx, point[1] + dy]));
        if (neighbor) {
          remaining.delete(key(neighbor));
          queue.push(neighbor);
        }
      }
    }
    result.push(queue.sort(ordered));
  }
  return result;
}

export function createBlocks(document: CityDocumentV1): Block[] {
  const size = document.map.size;
  const roads = occupiedRoadSet(document.roadGraph.cells);
  const free = document.map.boundaryMask.flatMap((valid, index): Point[] => {
    const point: Point = [index % size, Math.floor(index / size)];
    return valid && !roads.has(key(point)) ? [point] : [];
  });
  const blocks: Block[] = [];
  for (const cells of components(free)) {
    const center = cells.reduce<Point>((sum, p) => [sum[0] + p[0], sum[1] + p[1]], [0, 0]);
    const district = [...document.districts].sort((a, b) => {
      const distance = (p: Point) =>
        (p[0] - center[0] / cells.length) ** 2 + (p[1] - center[1] / cells.length) ** 2;
      return distance(a.center) - distance(b.center) || a.id.localeCompare(b.id);
    })[0];
    if (!district) throw new Error("GEN-006: blocks require a district.");
    blocks.push({
      id: deriveProceduralId(
        document.generator.version,
        document.generator.seed,
        document.generator.attempt,
        "block",
        blocks.length,
      ),
      districtId: district.id,
      zone: "suburban",
      cells,
      regenerationIndex: 0,
    });
  }
  return blocks;
}

const MAX_LOT_DEPTH = 4;
const MAX_LOT_WIDTH = 4;

function assignedFrontage(
  cell: Point,
  sidewalks: ReadonlySet<string>,
  packable: ReadonlySet<string>,
): Lot["frontage"] | undefined {
  let best: { direction: Lot["frontage"]; depth: number } | undefined;
  for (const direction of DIRECTIONS) {
    let depth: number | undefined;
    for (let step = 1; step <= MAX_LOT_DEPTH; step += 1) {
      const next: Point = [cell[0] + direction.dx * step, cell[1] + direction.dy * step];
      if (sidewalks.has(key(next))) {
        depth = step;
        break;
      }
      if (!packable.has(key(next))) break;
    }
    if (depth === undefined) continue;
    if (!best || depth < best.depth) best = { direction: direction.name, depth };
  }
  return best?.direction;
}

/** GEN-007/GEN-022: pack a frontage ring inward of the sidewalk; interior remains a courtyard. */
export function createLots(document: CityDocumentV1): Lot[] {
  const sidewalks = sidewalkKeySet(document);
  const lots: Lot[] = [];
  for (const block of document.blocks) {
    const packable = new Set(block.cells.filter((cell) => !sidewalks.has(key(cell))).map(key));
    const assignment = new Map<string, Lot["frontage"]>();
    for (const cell of block.cells) {
      if (!packable.has(key(cell))) continue;
      const frontage = assignedFrontage(cell, sidewalks, packable);
      if (frontage) assignment.set(key(cell), frontage);
    }
    const available = new Set(assignment.keys());
    for (const start of block.cells) {
      const startKey = key(start);
      if (!available.has(startKey)) continue;
      const frontage = assignment.get(startKey);
      if (!frontage) continue;
      const direction = DIRECTIONS.find((entry) => entry.name === frontage);
      if (!direction) continue;
      if (!sidewalks.has(key([start[0] + direction.dx, start[1] + direction.dy]))) continue;
      let best: Point[] | undefined;
      const tangent: Point = direction.dx === 0 ? [1, 0] : [0, 1];
      for (let width = MAX_LOT_WIDTH; width >= 1; width -= 1) {
        if (
          !sidewalks.has(
            key([
              start[0] + tangent[0] * (width - 1) + direction.dx,
              start[1] + tangent[1] * (width - 1) + direction.dy,
            ]),
          )
        )
          continue;
        for (let depth = MAX_LOT_DEPTH; depth >= 1; depth -= 1) {
          const cells: Point[] = [];
          let valid = true;
          for (let w = 0; w < width && valid; w += 1) {
            for (let d = 0; d < depth; d += 1) {
              const point: Point = [
                start[0] + tangent[0] * w - direction.dx * d,
                start[1] + tangent[1] * w - direction.dy * d,
              ];
              if (assignment.get(key(point)) !== frontage || !available.has(key(point))) {
                valid = false;
                break;
              }
              cells.push(point);
            }
          }
          if (!valid) continue;
          if (!best || cells.length > best.length) best = cells;
        }
      }
      if (!best) continue;
      const lotMinX = Math.min(...best.map(([x]) => x));
      const lotMaxX = Math.max(...best.map(([x]) => x));
      const lotMinY = Math.min(...best.map(([, y]) => y));
      const lotMaxY = Math.max(...best.map(([, y]) => y));
      const front = best.filter(([x, y]) =>
        frontage === "north"
          ? y === lotMinY
          : frontage === "south"
            ? y === lotMaxY
            : frontage === "east"
              ? x === lotMaxX
              : x === lotMinX,
      );
      if (!front.every(([x, y]) => sidewalks.has(key([x + direction.dx, y + direction.dy])))) {
        available.delete(startKey);
        continue;
      }
      for (const point of best) available.delete(key(point));
      lots.push({
        id: deriveProceduralId(
          document.generator.version,
          document.generator.seed,
          document.generator.attempt,
          "lot",
          lots.length,
        ),
        blockId: block.id,
        cells: best.sort(ordered),
        frontage,
      });
    }
  }
  return lots;
}

/** GEN-008/GEN-023: spatial suitability within remaining area quotas. */
export function assignZones(document: CityDocumentV1): void {
  const roads = occupiedRoadSet(document.roadGraph.cells);
  const pocket = document.blocks.filter((block) => isPocketParkBlock(block.cells, roads));
  const buildable = document.blocks.filter((block) => !isPocketParkBlock(block.cells, roads));
  for (const block of pocket) block.zone = "park";
  const total = buildable.reduce((sum, block) => sum + block.cells.length, 0);
  const mix = document.generator.parameters.zoneMix;
  const remaining = Object.fromEntries(
    ZONE_TYPES.map((zone) => [zone, (total * mix[zone]) / 100]),
  ) as Record<ZoneType, number>;
  for (const block of [...buildable].sort(
    (a, b) =>
      b.cells.length - a.cells.length || ordered(a.cells[0] ?? [0, 0], b.cells[0] ?? [0, 0]),
  )) {
    const centrality =
      block.cells.reduce(
        (sum, [x, y]) => sum + (document.map.densityField[y * document.map.size + x] ?? 0),
        0,
      ) / block.cells.length;
    const access =
      block.cells.filter(([x, y]) =>
        DIRECTIONS.some(({ dx, dy }) => roads.has(key([x + dx, y + dy]))),
      ).length / block.cells.length;
    const periphery = 1 - centrality;
    const scores: Record<ZoneType, number> = {
      suburban: periphery + access * 0.3,
      urban: centrality * 2 + access,
      commercial: centrality + access * 2,
      industrial: periphery + access + Math.min(1, block.cells.length / 120),
      park: periphery + (1 - access) * 1.2,
    };
    const positive = ZONE_TYPES.filter((zone) => mix[zone] > 0);
    const fitting = positive.filter((zone) => remaining[zone] >= block.cells.length);
    const candidates = fitting.length ? fitting : positive;
    const zone = [...candidates].sort((a, b) =>
      fitting.length
        ? scores[b] - scores[a] || remaining[b] - remaining[a]
        : remaining[b] - remaining[a],
    )[0];
    if (!zone) throw new Error("GEN-008: zone mix is empty.");
    block.zone = zone;
    remaining[zone] -= block.cells.length;
  }
}

export function zoneAreaShares(document: CityDocumentV1): Record<ZoneType, number> {
  return zoneAreaSharesFrom(document.blocks);
}

/** GEN-023: pocket-park remnants are excluded from mix quotas. */
export function quotaZoneAreaShares(document: CityDocumentV1): Record<ZoneType, number> {
  const roads = occupiedRoadSet(document.roadGraph.cells);
  return zoneAreaSharesFrom(
    document.blocks.filter((block) => !isPocketParkBlock(block.cells, roads)),
  );
}

function zoneAreaSharesFrom(blocks: readonly Block[]): Record<ZoneType, number> {
  const areas: Record<ZoneType, number> = {
    suburban: 0,
    urban: 0,
    commercial: 0,
    industrial: 0,
    park: 0,
  };
  let total = 0;
  for (const block of blocks) {
    areas[block.zone] += block.cells.length;
    total += block.cells.length;
  }
  for (const zone of ZONE_TYPES) areas[zone] = total ? (areas[zone] / total) * 100 : 0;
  return areas;
}

/** TST-003: independently validate coverage, ownership, rectangles and frontage. */
export function validateLandCity(document: CityDocumentV1): string[] {
  const issues: string[] = [];
  const size = document.map.size;
  const roads = occupiedRoadSet(document.roadGraph.cells);
  const sidewalks = sidewalkKeySet(document);
  const districts = new Set(document.districts.map((district) => district.id));
  const blocks = new Map(document.blocks.map((block) => [block.id, new Set(block.cells.map(key))]));
  const covered = new Set<string>();
  const lotCells = new Set<string>();
  const ids = new Set<string>();
  for (const block of document.blocks) {
    if (ids.has(block.id)) issues.push(`duplicate block ID ${block.id}`);
    ids.add(block.id);
    if (!districts.has(block.districtId)) issues.push(`block ${block.id} has missing district`);
    if (!block.cells.length || components(block.cells).length !== 1)
      issues.push(`block ${block.id} is not connected`);
    for (const [x, y] of block.cells) {
      const cell = key([x, y]);
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0 ||
        x >= size ||
        y >= size ||
        !document.map.boundaryMask[y * size + x] ||
        roads.has(cell)
      )
        issues.push(`block ${block.id} has invalid cell`);
      if (covered.has(cell)) issues.push(`overlapping block cell ${cell}`);
      covered.add(cell);
    }
  }
  document.map.boundaryMask.forEach((valid, index) => {
    const cell = key([index % size, Math.floor(index / size)]);
    if (valid && !roads.has(cell) && !covered.has(cell))
      issues.push(`unassigned free cell ${cell}`);
  });
  ids.clear();
  for (const lot of document.lots) {
    if (ids.has(lot.id)) issues.push(`duplicate lot ID ${lot.id}`);
    ids.add(lot.id);
    const owner = blocks.get(lot.blockId);
    if (!owner) issues.push(`lot ${lot.id} has missing block`);
    for (const point of lot.cells) {
      const cell = key(point);
      if (!owner?.has(cell)) issues.push(`lot ${lot.id} leaves its block`);
      if (sidewalks.has(cell)) issues.push(`lot ${lot.id} overlaps sidewalk`);
      if (lotCells.has(cell)) issues.push(`overlapping lot cell ${cell}`);
      lotCells.add(cell);
    }
    const xs = lot.cells.map(([x]) => x);
    const ys = lot.cells.map(([, y]) => y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    if (
      !lot.cells.length ||
      (maxX - minX + 1) * (maxY - minY + 1) !== new Set(lot.cells.map(key)).size
    )
      issues.push(`lot ${lot.id} is not rectangular`);
    const direction = DIRECTIONS.find((entry) => entry.name === lot.frontage);
    const front = lot.cells.filter(([x, y]) =>
      lot.frontage === "north"
        ? y === minY
        : lot.frontage === "south"
          ? y === maxY
          : lot.frontage === "east"
            ? x === maxX
            : x === minX,
    );
    if (
      !direction ||
      !front.length ||
      !front.every(([x, y]) => sidewalks.has(key([x + direction.dx, y + direction.dy])))
    )
      issues.push(`lot ${lot.id} has no full sidewalk frontage`);
  }
  const shares = quotaZoneAreaShares(document);
  if (!document.blocks.length || !document.lots.length)
    issues.push("land generation produced no blocks or lots");
  for (const zone of ZONE_TYPES) {
    if (Math.abs(shares[zone] - document.generator.parameters.zoneMix[zone]) > 5)
      issues.push(`zone ${zone} exceeds area tolerance`);
  }
  return issues;
}
