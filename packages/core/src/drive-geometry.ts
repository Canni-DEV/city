import { DRIVE_TOLERANCE } from "./drive-contracts.js";
import type { Point } from "./road-tiles.js";

export type Cubic = [Point, Point, Point, Point];
export interface CurveSample {
  t: number;
  distance: number;
  point: Point;
}
export interface DriveCurve {
  controls: Cubic;
  samples: CurveSample[];
  length: number;
}
export function cubicPoint(c: Cubic, t: number): Point {
  const u = 1 - t;
  return [0, 1].map(
    (i) =>
      u * u * u * c[0][i]! +
      3 * u * u * t * c[1][i]! +
      3 * u * t * t * c[2][i]! +
      t * t * t * c[3][i]!,
  ) as Point;
}
export function cubicTangent(c: Cubic, t: number): Point {
  const u = 1 - t;
  const v = [0, 1].map(
    (i) =>
      3 * u * u * (c[1][i]! - c[0][i]!) +
      6 * u * t * (c[2][i]! - c[1][i]!) +
      3 * t * t * (c[3][i]! - c[2][i]!),
  ) as Point;
  const n = Math.hypot(...v);
  return n > 1e-12 ? [v[0] / n, v[1] / n] : [0, 0];
}
export const pointDistance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export function splitCubic(c: Cubic): [Cubic, Cubic] {
  const a = mid(c[0], c[1]),
    b = mid(c[1], c[2]),
    d = mid(c[2], c[3]);
  const e = mid(a, b),
    f = mid(b, d),
    g = mid(e, f);
  return [
    [c[0], a, e, g],
    [g, f, d, c[3]],
  ];
}
export function createDriveCurve(controls: Cubic): DriveCurve {
  const samples: CurveSample[] = [{ t: 0, distance: 0, point: controls[0] }];
  let length = 0;
  const visit = (c: Cubic, lo: number, hi: number, depth: number) => {
    const chord = pointDistance(c[0], c[3]);
    const polygon =
      pointDistance(c[0], c[1]) + pointDistance(c[1], c[2]) + pointDistance(c[2], c[3]);
    if (depth < 18 && (polygon - chord > DRIVE_TOLERANCE * (hi - lo) * 0.25 || polygon > 0.05)) {
      const [a, b] = splitCubic(c);
      const m = (lo + hi) / 2;
      visit(a, lo, m, depth + 1);
      visit(b, m, hi, depth + 1);
      return;
    }
    length += (polygon + chord) / 2;
    samples.push({ t: hi, distance: length, point: c[3] });
  };
  visit(controls, 0, 1, 0);
  return { controls, samples, length };
}
export function sampleDriveCurve(curve: DriveCurve, distance: number) {
  const s = Math.max(0, Math.min(distance, curve.length));
  let lo = 0,
    hi = curve.samples.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (curve.samples[m]!.distance < s) lo = m;
    else hi = m;
  }
  const a = curve.samples[lo]!,
    b = curve.samples[hi]!;
  const t = a.t + ((b.t - a.t) * (s - a.distance)) / Math.max(1e-12, b.distance - a.distance);
  const point = cubicPoint(curve.controls, t),
    tangent = cubicTangent(curve.controls, t);
  return { x: point[0], z: point[1], yaw: Math.atan2(tangent[0], tangent[1]) };
}

export function transformRoadPoint(
  point: Point,
  position: Point,
  rotation: number,
  size: number,
): Point {
  const angle = (rotation * Math.PI) / 180,
    c = Math.round(Math.cos(angle)),
    s = Math.round(Math.sin(angle));
  return [
    position[0] + size / 2 + point[0] * c - point[1] * s,
    position[1] + size / 2 + point[0] * s + point[1] * c,
  ];
}
export function pointInTriangle(p: Point, triangle: readonly Point[], epsilon = 1e-8): boolean {
  const signs = triangle.map((a, i) => {
    const b = triangle[(i + 1) % 3]!;
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  });
  return signs.every((n) => n >= -epsilon) || signs.every((n) => n <= epsilon);
}
