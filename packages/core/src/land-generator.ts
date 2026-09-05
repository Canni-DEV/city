import { type CityDocumentV1, ZONE_TYPES, type ZoneType } from "./domain.js";
import { deriveProceduralId } from "./ids.js";

type Point = [number, number];
type Block = CityDocumentV1["blocks"][number];
type Lot = CityDocumentV1["lots"][number];
const DIRECTIONS = [
  { name: "north", dx: 0, dy: -1 },
  { name: "east", dx: 1, dy: 0 },
  { name: "south", dx: 0, dy: 1 },
  { name: "west", dx: -1, dy: 0 },
] as const;
const key = ([x, y]: Point) => `${x},${y}`;
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
  const roads = new Set(document.roadGraph.cells.map((cell) => key(cell.position)));
  const free = document.map.boundaryMask.flatMap((valid, index): Point[] => {
    const point: Point = [index % size, Math.floor(index / size)];
    return valid && !roads.has(key(point)) ? [point] : [];
  });
  const blocks: Block[] = [];
  for (const region of components(free)) {
    // Bounded zoning blocks keep area quotas achievable even in large open regions.
    const patches = new Map<string, Point[]>();
    for (const point of region) {
      const patchKey = `${Math.floor(point[0] / 4)},${Math.floor(point[1] / 4)}`;
      const patch = patches.get(patchKey) ?? [];
      patch.push(point);
      patches.set(patchKey, patch);
    }
    for (const patch of patches.values()) {
      for (const cells of components(patch)) {
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
    }
  }
  return blocks;
}

/** GEN-007/GEN-022: greedily pack rectangles with a fully road-facing side. */
export function createLots(document: CityDocumentV1): Lot[] {
  const roads = new Set(document.roadGraph.cells.map((cell) => key(cell.position)));
  const lots: Lot[] = [];
  for (const block of document.blocks) {
    const available = new Set(block.cells.map(key));
    for (const start of block.cells) {
      if (!available.has(key(start))) continue;
      let best: { cells: Point[]; frontage: Lot["frontage"] } | undefined;
      for (const direction of DIRECTIONS) {
        if (!roads.has(key([start[0] + direction.dx, start[1] + direction.dy]))) continue;
        const tangent: Point = direction.dx === 0 ? [1, 0] : [0, 1];
        for (let width = 1; width <= 4; width += 1) {
          if (
            !roads.has(
              key([
                start[0] + tangent[0] * (width - 1) + direction.dx,
                start[1] + tangent[1] * (width - 1) + direction.dy,
              ]),
            )
          )
            break;
          for (let depth = 1; depth <= 4; depth += 1) {
            const cells: Point[] = [];
            for (let w = 0; w < width; w += 1) {
              for (let d = 0; d < depth; d += 1)
                cells.push([
                  start[0] + tangent[0] * w - direction.dx * d,
                  start[1] + tangent[1] * w - direction.dy * d,
                ]);
            }
            if (!cells.every((point) => available.has(key(point)))) break;
            if (!best || cells.length > best.cells.length)
              best = { cells, frontage: direction.name };
          }
        }
      }
      if (!best) continue;
      for (const point of best.cells) available.delete(key(point));
      lots.push({
        id: deriveProceduralId(
          document.generator.version,
          document.generator.seed,
          document.generator.attempt,
          "lot",
          lots.length,
        ),
        blockId: block.id,
        cells: best.cells.sort(ordered),
        frontage: best.frontage,
      });
    }
  }
  return lots;
}

/** GEN-008/GEN-023: spatial suitability within remaining area quotas. */
export function assignZones(document: CityDocumentV1): void {
  const total = document.blocks.reduce((sum, block) => sum + block.cells.length, 0);
  const mix = document.generator.parameters.zoneMix;
  const remaining = Object.fromEntries(
    ZONE_TYPES.map((zone) => [zone, (total * mix[zone]) / 100]),
  ) as Record<ZoneType, number>;
  const roads = new Set(document.roadGraph.cells.map((cell) => key(cell.position)));
  for (const block of [...document.blocks].sort(
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
      industrial: periphery + access + block.cells.length / 16,
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
  const areas: Record<ZoneType, number> = {
    suburban: 0,
    urban: 0,
    commercial: 0,
    industrial: 0,
    park: 0,
  };
  let total = 0;
  for (const block of document.blocks) {
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
  const roads = new Set(document.roadGraph.cells.map((cell) => key(cell.position)));
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
      !front.every(([x, y]) => roads.has(key([x + direction.dx, y + direction.dy])))
    )
      issues.push(`lot ${lot.id} has no full road frontage`);
  }
  const shares = zoneAreaShares(document);
  if (!document.blocks.length || !document.lots.length)
    issues.push("land generation produced no blocks or lots");
  for (const zone of ZONE_TYPES) {
    if (Math.abs(shares[zone] - document.generator.parameters.zoneMix[zone]) > 5)
      issues.push(`zone ${zone} exceeds area tolerance`);
  }
  return issues;
}
