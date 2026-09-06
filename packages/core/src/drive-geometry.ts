import { required } from "./drive-contracts.js";
import type { Point } from "./road-tiles.js";

export type { Cubic, CurveSample, PathCurve as DriveCurve } from "./path-geometry.js";
export {
  createPathCurve as createDriveCurve,
  cubicPoint,
  cubicTangent,
  pointDistance,
  samplePathCurve as sampleDriveCurve,
  splitCubic,
} from "./path-geometry.js";
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
    const b = required(triangle[(i + 1) % 3], "triangle");
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  });
  return signs.every((n) => n >= -epsilon) || signs.every((n) => n <= epsilon);
}
