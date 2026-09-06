import type { CityDocumentV1 } from "./domain.js";
import type { DriveAsset, VehicleBounds } from "./drive-contracts.js";
import {
  type Cubic,
  cubicPoint,
  cubicTangent,
  pointInTriangle,
  splitCubic,
  transformRoadPoint,
} from "./drive-geometry.js";
import { occupiedCellsForRoadTile, type Point, roadFootprint } from "./road-tiles.js";

const cross = (a: Point, b: Point, p: Point) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const area = (p: Point[]) =>
  Math.abs(
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length]!;
      return s + a[0] * b[1] - a[1] * b[0];
    }, 0),
  ) / 2;
const boundaryCache = new WeakMap<object, [Point, Point][]>();
function profileBoundary(triangles: [Point, Point, Point][]): [Point, Point][] {
  const cached = boundaryCache.get(triangles);
  if (cached) return cached;
  const vertices = [...new Map(triangles.flat().map((p) => [p.join(","), p])).values()];
  const edges = new Map<string, { a: Point; b: Point; count: number }>();
  for (const tri of triangles)
    for (let i = 0; i < 3; i++) {
      const a = tri[i]!,
        b = tri[(i + 1) % 3]!,
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len2 = dx * dx + dz * dz;
      if (len2 < 1e-12) continue;
      const points = vertices
        .map((p) => ({ p, t: ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2 }))
        .filter((v) => v.t >= -1e-6 && v.t <= 1 + 1e-6 && Math.abs(cross(a, b, v.p)) < 1e-6)
        .sort((a, b) => a.t - b.t);
      for (let j = 1; j < points.length; j++) {
        const p = points[j - 1]!.p,
          q = points[j]!.p;
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6) continue;
        const key = [p.map((n) => n.toFixed(5)).join(","), q.map((n) => n.toFixed(5)).join(",")]
          .sort()
          .join(":");
        const edge = edges.get(key) ?? { a: p, b: q, count: 0 };
        edge.count++;
        edges.set(key, edge);
      }
    }
  const result = [...edges.values()]
    .filter((e) => e.count === 1)
    .map((e) => [e.a, e.b] as [Point, Point]);
  boundaryCache.set(triangles, result);
  return result;
}
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (ps: Point[]) => {
    const h: Point[] = [];
    for (const p of ps) {
      while (h.length > 1 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    return h;
  };
  const a = half(sorted),
    b = half(sorted.reverse());
  a.pop();
  b.pop();
  return [...a, ...b];
}
export interface DriveSurface {
  triangles: [Point, Point, Point][];
  boundaries: [Point, Point][];
  covers(polygon: Point[]): boolean;
}
export function buildDriveSurface(
  document: CityDocumentV1,
  assets: readonly DriveAsset[],
): DriveSurface {
  const catalog = new Map(assets.map((a) => [a.id, a]));
  const triangles: [Point, Point, Point][] = [];
  const boundaries: [Point, Point][] = [];
  const boundaryBuckets = new Map<string, [Point, Point][]>();
  const buckets = new Map<string, [Point, Point, Point][]>();
  for (const tile of document.roadGraph.cells) {
    const profile = catalog.get(tile.assetId)?.driveProfile;
    if (!profile) continue;
    for (const edge of profileBoundary(profile.triangles)) {
      const pair = edge.map((p) =>
        transformRoadPoint(p, tile.position, tile.rotation, roadFootprint(tile.assetId).width),
      ) as [Point, Point];
      boundaries.push(pair);
      for (
        let x = Math.floor(Math.min(pair[0][0], pair[1][0]));
        x <= Math.floor(Math.max(pair[0][0], pair[1][0]));
        x++
      )
        for (
          let z = Math.floor(Math.min(pair[0][1], pair[1][1]));
          z <= Math.floor(Math.max(pair[0][1], pair[1][1]));
          z++
        ) {
          const key = x + "," + z,
            list = boundaryBuckets.get(key) ?? [];
          list.push(pair);
          boundaryBuckets.set(key, list);
        }
    }
    for (const local of profile.triangles) {
      const tri = local.map((p) =>
        transformRoadPoint(p, tile.position, tile.rotation, roadFootprint(tile.assetId).width),
      ) as [Point, Point, Point];
      if (cross(tri[0], tri[1], tri[2]) < 0) [tri[1], tri[2]] = [tri[2], tri[1]];
      if (area(tri) < 1e-10) continue;
      triangles.push(tri);
      for (
        let x = Math.floor(Math.min(...tri.map((p) => p[0])));
        x <= Math.floor(Math.max(...tri.map((p) => p[0])));
        x++
      )
        for (
          let z = Math.floor(Math.min(...tri.map((p) => p[1])));
          z <= Math.floor(Math.max(...tri.map((p) => p[1])));
          z++
        ) {
          const key = `${x},${z}`,
            list = buckets.get(key) ?? [];
          list.push(tri);
          buckets.set(key, list);
        }
    }
  }
  const contains = (p: Point) => {
    const x = Math.floor(p[0]),
      z = Math.floor(p[1]);
    if (
      x < 0 ||
      z < 0 ||
      x >= document.map.size ||
      z >= document.map.size ||
      !document.map.boundaryMask[z * document.map.size + x]
    )
      return false;
    return (buckets.get(x + "," + z) ?? []).some((t) => pointInTriangle(p, t));
  };
  return {
    triangles,
    boundaries,
    covers(polygon) {
      if (!polygon.every(contains)) return false;
      const candidates = new Set<[Point, Point]>();
      for (
        let x = Math.floor(Math.min(...polygon.map((p) => p[0])));
        x <= Math.floor(Math.max(...polygon.map((p) => p[0])));
        x++
      )
        for (
          let z = Math.floor(Math.min(...polygon.map((p) => p[1])));
          z <= Math.floor(Math.max(...polygon.map((p) => p[1])));
          z++
        )
          for (const edge of boundaryBuckets.get(x + "," + z) ?? []) candidates.add(edge);
      for (const [a, b] of candidates) {
        let lo = 0,
          hi = 1;
        for (let i = 0; i < polygon.length; i++) {
          const p = polygon[i]!,
            q = polygon[(i + 1) % polygon.length]!,
            da = cross(p, q, a),
            db = cross(p, q, b),
            slope = db - da;
          if (Math.abs(slope) < 1e-12) {
            if (da < 1e-9) {
              hi = -1;
              break;
            }
            continue;
          }
          const t = (1e-9 - da) / slope;
          if (slope > 0) lo = Math.max(lo, t);
          else hi = Math.min(hi, t);
        }
        if (hi <= lo) continue;
        const t = (lo + hi) / 2,
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          n = Math.hypot(dx, dz),
          p: Point = [a[0] + dx * t, a[1] + dz * t];
        if (
          !contains([p[0] - (dz / n) * 1e-5, p[1] + (dx / n) * 1e-5]) ||
          !contains([p[0] + (dz / n) * 1e-5, p[1] - (dx / n) * 1e-5])
        )
          return false;
      }
      return true;
    },
  };
}

function bodyCorners(bounds: VehicleBounds, tangent: Point, pad = 0): Point[] {
  const [fx, fz] = tangent;
  return [
    [bounds.min[0] - pad, bounds.min[1] - pad],
    [bounds.max[0] + pad, bounds.min[1] - pad],
    [bounds.max[0] + pad, bounds.max[1] + pad],
    [bounds.min[0] - pad, bounds.max[1] + pad],
  ].map(([x, z]) => [x! * fz + z! * fx, -x! * fx + z! * fz]);
}
export function vehicleFootprint(position: Point, tangent: Point, bounds: VehicleBounds): Point[] {
  return bodyCorners(bounds, tangent).map((p) => [p[0] + position[0], p[1] + position[1]]);
}
/** Conservative swept envelope: derivative lies in its quadratic control cone. */
export function curveFitsSurface(c: Cubic, bounds: VehicleBounds, surface: DriveSurface): boolean {
  const radius = Math.max(...bodyCorners(bounds, [0, 1]).map((p) => Math.hypot(...p)));
  const visit = (curve: Cubic, depth: number): boolean => {
    const tangent = cubicTangent(curve, 0.5),
      center = cubicPoint(curve, 0.5);
    if (Math.hypot(...tangent) < 0.5) return false;
    const actual = bodyCorners(bounds, tangent).map(
      (p) => [p[0] + center[0], p[1] + center[1]] as Point,
    );
    if (!surface.covers(actual)) return false;
    let angle = 0;
    for (let i = 0; i < 3; i++) {
      const a = curve[i]!,
        b = curve[i + 1]!,
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        n = Math.hypot(dx, dz);
      if (n < 1e-12) continue;
      angle = Math.max(
        angle,
        Math.acos(Math.min(1, Math.max(-1, (dx * tangent[0] + dz * tangent[1]) / n))),
      );
    }
    const pad = 2 * radius * Math.sin(angle / 2) + 1e-6;
    if (angle < Math.PI / 2) {
      const corners = bodyCorners(bounds, tangent, pad);
      if (
        surface.covers(
          hull(curve.flatMap((p) => corners.map((q) => [p[0] + q[0], p[1] + q[1]] as Point))),
        )
      )
        return true;
    }
    if (depth >= 14) return false;
    const [a, b] = splitCubic(curve);
    return visit(a, depth + 1) && visit(b, depth + 1);
  };
  return visit(c, 0);
}

/** Reconstructible cache of identical local configurations; bounded independently of city size. */
export function createCurveValidator(
  document: CityDocumentV1,
  bounds: VehicleBounds,
  surface: DriveSurface,
) {
  const cache = new Map<string, boolean>();
  const tiles = new Map(
    document.roadGraph.cells.flatMap((t) =>
      occupiedCellsForRoadTile(t).map((p) => [p.join(","), t] as const),
    ),
  );
  return (c: Cubic): boolean => {
    const origin: Point = [Math.floor(c[0][0]), Math.floor(c[0][1])];
    const neighbors = new Set<CityDocumentV1["roadGraph"]["cells"][number]>();
    const mask: string[] = [];
    const minX = Math.floor(Math.min(...c.map((p) => p[0])) - 0.5),
      maxX = Math.floor(Math.max(...c.map((p) => p[0])) + 0.5),
      minZ = Math.floor(Math.min(...c.map((p) => p[1])) - 0.5),
      maxZ = Math.floor(Math.max(...c.map((p) => p[1])) + 0.5);
    for (let x = minX; x <= maxX; x++)
      for (let z = minZ; z <= maxZ; z++) {
        const t = tiles.get(`${x},${z}`);
        if (t) neighbors.add(t);
        if (
          x < 0 ||
          z < 0 ||
          x >= document.map.size ||
          z >= document.map.size ||
          !document.map.boundaryMask[z * document.map.size + x]
        )
          mask.push(`${x - origin[0]},${z - origin[1]}`);
      }
    const controls = c.map((p) =>
      [p[0] - origin[0], p[1] - origin[1]].map((n) => Number(n.toFixed(6))),
    );
    const key = JSON.stringify([
      controls,
      [...neighbors]
        .map((t) => [t.position[0] - origin[0], t.position[1] - origin[1], t.assetId, t.rotation])
        .sort(),
      mask,
    ]);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const result = curveFitsSurface(c, bounds, surface);
    if (cache.size < 50000) cache.set(key, result);
    return result;
  };
}
