import type { VehicleBounds } from "./drive-contracts.js";
import { type Cubic, pointDistance } from "./drive-geometry.js";
import { curveFitsSurface, type DriveSurface, vehicleFootprint } from "./drive-surface.js";
import type { Point } from "./road-tiles.js";

interface Pose {
  point: Point;
  tangent: Point;
}
/** Configuration graph stays inside one resolved junction, never across unrelated streets. */
export function createJunctionRouter(
  cells: Point[],
  bounds: VehicleBounds,
  surface: DriveSurface,
  fits = (c: Cubic) => curveFitsSurface(c, bounds, surface),
  dense = false,
) {
  const poses: Pose[] = [];
  for (const cell of cells)
    for (let angle = 0; angle < 8; angle++)
      for (const offset of [0, 0.16, -0.16]) for(const along of dense?[-0.25,0,0.25]:[0]) {
        const theta = (angle * Math.PI) / 4,
          tangent: Point = [Math.sin(theta), Math.cos(theta)];
        const point: Point = [
          cell[0] + 0.5 - tangent[1] * offset+tangent[0]*along,
          cell[1] + 0.5 + tangent[0] * offset+tangent[1]*along,
        ];
        if (surface.covers(vehicleFootprint(point, tangent, bounds)))
          poses.push({ point, tangent });
      }
  const cache = new Map<string, Cubic | null>();
  function edge(a: Pose, b: Pose): Cubic | null {
    const key = JSON.stringify([a, b]);
    if (cache.has(key)) return cache.get(key)!;
    const distance = pointDistance(a.point, b.point);
    if (distance < 0.1 || distance > 1.6) return null;
    const dx = (b.point[0] - a.point[0]) / distance,
      dz = (b.point[1] - a.point[1]) / distance;
    if (
      dx * a.tangent[0] + dz * a.tangent[1] < 0.1 ||
      dx * b.tangent[0] + dz * b.tangent[1] < 0.1 ||
      a.tangent[0] * b.tangent[0] + a.tangent[1] * b.tangent[1] < -0.01
    )
      return null;
    for (const scale of [0.39, 0.25, 0.5]) {
      const h = distance * scale;
      const c: Cubic = [
        a.point,
        [a.point[0] + a.tangent[0] * h, a.point[1] + a.tangent[1] * h],
        [b.point[0] - b.tangent[0] * h, b.point[1] - b.tangent[1] * h],
        b.point,
      ];
      if (fits(c)) {
        cache.set(key, c);
        return c;
      }
    }
    cache.set(key, null);
    return null;
  }
  return (start: Pose, goal: Pose): Cubic[] | undefined => {
    const nodes = [start, ...poses, goal],
      target = nodes.length - 1,
      cost = new Map([[0, 0]]),
      parent = new Map<number, { node: number; curve: Cubic }>(),
      open = [0],
      closed = new Set<number>();
    while (open.length) {
      open.sort(
        (a, b) =>
          cost.get(a)! +
            pointDistance(nodes[a]!.point, goal.point) -
            cost.get(b)! -
            pointDistance(nodes[b]!.point, goal.point) || a - b,
      );
      const current = open.shift()!;
      if (current === target) {
        const path: Cubic[] = [];
        let i = current;
        while (parent.has(i)) {
          const p = parent.get(i)!;
          path.unshift(p.curve);
          i = p.node;
        }
        return path;
      }
      closed.add(current);
      const candidates = nodes
        .map((p, i) => ({ p, i, d: pointDistance(nodes[current]!.point, p.point) }))
        .filter((v) => v.i !== current && !closed.has(v.i) && v.d <= 1.6 && v.d >= 0.1)
        .sort((a, b) => a.d - b.d || a.i - b.i);
      for (const { p, i, d } of candidates) {
        const next = cost.get(current)! + d;
        if (next >= (cost.get(i) ?? Infinity)) continue;
        const c = edge(nodes[current]!, p);
        if (!c) continue;
        cost.set(i, next);
        parent.set(i, { node: current, curve: c });
        if (!open.includes(i)) open.push(i);
      }
    }
    return;
  };
}
