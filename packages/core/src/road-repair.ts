import type { CityDocumentV1 } from "./domain.js";
import type { DriveAsset } from "./drive-contracts.js";
import { transformRoadPoint } from "./drive-geometry.js";
import { stitchAvenueJunctions } from "./road-mesh.js";
import {
  connectionNames,
  DIRECTION_DELTA,
  isAvenueClass,
  OPPOSITE_CARDINAL,
  occupiedCellsForRoadTile,
  occupiedRoadSet,
  type Point,
  ROAD_TILE_CONNECTORS,
  resolveUnitTile,
  roadFootprint,
  rotateConnector,
  rotateConnectors,
  sameConnectors,
  tileAssetFor,
  topologyFromConnections,
  yawForConnectors,
} from "./road-tiles.js";

/** GEN-029: minimal, stable repairs to tile openings before land allocation. */
export function repairRoadOpenings(document: CityDocumentV1, assets: readonly DriveAsset[]): void {
  const catalog = new Map(assets.map((a) => [a.id, a]));
  const size = document.map.size;
  const original = new Map(
    document.roadGraph.cells
      .filter((t) => roadFootprint(t.assetId).width === 1)
      .map((t) => [t.position.join(","), t]),
  );
  const affected = new Set<string>();
  const occupied = occupiedRoadSet(document.roadGraph.cells);
  const additions = new Map<string, Point>();
  for (const tile of original.values()) {
    if (!tile.assetId.includes("bend") || !isAvenueClass(tile.roadClass)) continue;
    for (const dx of [-1, 0])
      for (const dz of [-1, 0]) {
        const x = tile.position[0] + dx,
          z = tile.position[1] + dz;
        const square: Point[] = [
          [x, z],
          [x + 1, z],
          [x, z + 1],
          [x + 1, z + 1],
        ];
        const filled = square.filter((p) => isAvenueClass(original.get(p.join(","))?.roadClass));
        const missing = square.filter((p) => !occupied.has(p.join(",")));
        if (filled.length !== 3 || missing.length !== 1) continue;
        const p = missing[0];
        if (!p) continue;
        if (
          p[0] < 0 ||
          p[1] < 0 ||
          p[0] >= size ||
          p[1] >= size ||
          !document.map.boundaryMask[p[1] * size + p[0]]
        )
          continue;
        additions.set(p.join(","), p);
        for (const q of square) affected.add(q.join(","));
      }
  }
  const classes = new Map(
    document.roadGraph.cells.flatMap((t) =>
      occupiedCellsForRoadTile(t).map((p) => [p.join(","), t.roadClass ?? "local"] as const),
    ),
  );
  for (const key of additions.keys()) classes.set(key, "arterial");
  stitchAvenueJunctions(classes, size, document.map.boundaryMask);
  for (const key of classes.keys())
    if (!occupied.has(key) && !additions.has(key)) {
      const p = key.split(",").map(Number) as Point;
      additions.set(key, p);
      for (const d of Object.values(DIRECTION_DELTA)) affected.add(`${p[0] + d[0]},${p[1] + d[1]}`);
      affected.add(key);
    }
  for (const [key, position] of [...additions].sort(([a], [b]) => a.localeCompare(b))) {
    occupied.add(key);
    document.roadGraph.cells.push({
      id: `transition:${position.join(":")}`,
      position,
      assetId: "roads:road-crossroad",
      rotation: 0,
      roadClass: "arterial",
    });
  }
  for (const tile of document.roadGraph.cells)
    if (affected.has(tile.position.join(","))) {
      const resolved = resolveUnitTile(
        connectionNames(tile.position, occupied),
        tile.roadClass ?? "arterial",
      );
      tile.assetId = resolved.assetId;
      tile.rotation = resolved.rotation;
    }
  for (const tile of document.roadGraph.cells) {
    const [x, z] = tile.position;
    if (x === 0 || z === 0 || x === size - 1 || z === size - 1) {
      tile.assetId = "roads:road-straight";
      tile.rotation = x === 0 || x === size - 1 ? 0 : 90;
    }
  }
  const tileByCell = new Map(document.roadGraph.cells.map((t) => [t.position.join(","), t]));
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const tile of [...document.roadGraph.cells].sort((a, b) => a.id.localeCompare(b.id))) {
      for (const port of catalog.get(tile.assetId)?.driveProfile?.ports ?? []) {
        const direction = rotateConnector(port.direction, tile.rotation),
          d = DIRECTION_DELTA[direction];
        const p = transformRoadPoint(
          port.position,
          tile.position,
          tile.rotation,
          roadFootprint(tile.assetId).width,
        );
        const cell = [Math.floor(p[0] + d[0] * 0.01), Math.floor(p[1] + d[1] * 0.01)];
        const neighbor = tileByCell.get(cell.join(","));
        if (!neighbor || roadFootprint(neighbor.assetId).width !== 1) continue;
        const connectors = rotateConnectors(
          ROAD_TILE_CONNECTORS[neighbor.assetId] ?? [],
          neighbor.rotation,
        );
        const incoming = OPPOSITE_CARDINAL[direction];
        if (connectors.includes(incoming)) continue;
        connectors.push(incoming);
        const assetId = tileAssetFor(
          neighbor.roadClass ?? "local",
          topologyFromConnections(connectors),
        );
        const rotation = yawForConnectors(ROAD_TILE_CONNECTORS[assetId] ?? [], connectors);
        if (
          rotation !== undefined &&
          !sameConnectors(
            rotateConnectors(ROAD_TILE_CONNECTORS[neighbor.assetId] ?? [], neighbor.rotation),
            connectors,
          )
        ) {
          neighbor.assetId = assetId;
          neighbor.rotation = rotation;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}
