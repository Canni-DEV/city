import type { SeededRandom } from "./rng.js";
import type { Point } from "./road-tiles.js";

export interface ScatterFootprint {
  width: number;
  depth: number;
}

export interface ScatterAabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ScatterSample {
  position: Point;
  radius: number;
}

export const OCCUPANT_INSET = 0.04;
export const CLUSTER_MIN_SEP = 0.08;
export const MAX_CLUSTER_COUNT = 4;
export const MAX_DART_ATTEMPTS = 16;
export const SPARSE_CHANCE = 0.15;

export function cellCenter(cell: Point): Point {
  return [cell[0] + 0.5, cell[1] + 0.5];
}

export function freeYaw(random: SeededRandom): number {
  return random.float() * 360;
}

export function scatterRadius(footprint: ScatterFootprint): number {
  return Math.hypot(footprint.width, footprint.depth) / 2;
}

export function clusterCount(decorationDensity: number): number {
  return Math.min(MAX_CLUSTER_COUNT, Math.max(1, Math.round(1 + decorationDensity / 50)));
}

export function aabbFor(position: Point, footprint: ScatterFootprint, yaw = 0): ScatterAabb {
  const swap = yaw === 90 || yaw === 270;
  const width = swap ? footprint.depth : footprint.width;
  const depth = swap ? footprint.width : footprint.depth;
  return {
    minX: position[0] - width / 2,
    maxX: position[0] + width / 2,
    minZ: position[1] - depth / 2,
    maxZ: position[1] + depth / 2,
  };
}

export function aabbInsideCell(aabb: ScatterAabb, cell: Point, inset = OCCUPANT_INSET): boolean {
  return (
    aabb.minX >= cell[0] + inset &&
    aabb.maxX <= cell[0] + 1 - inset &&
    aabb.minZ >= cell[1] + inset &&
    aabb.maxZ <= cell[1] + 1 - inset
  );
}

export function aabbsOverlap(left: ScatterAabb, right: ScatterAabb, gap = 0): boolean {
  return (
    left.minX < right.maxX + gap &&
    left.maxX + gap > right.minX &&
    left.minZ < right.maxZ + gap &&
    left.maxZ + gap > right.minZ
  );
}

/** Uniform jitter that keeps a 1×1 occupying AABB inside `cell`. */
export function occupantJitter(
  cell: Point,
  footprint: ScatterFootprint,
  random: SeededRandom,
  inset = OCCUPANT_INSET,
): Point {
  const halfX = footprint.width / 2;
  const halfZ = footprint.depth / 2;
  const maxX = Math.max(0, 0.5 - halfX - inset);
  const maxZ = Math.max(0, 0.5 - halfZ - inset);
  return [
    cell[0] + 0.5 + (random.float() * 2 - 1) * maxX,
    cell[1] + 0.5 + (random.float() * 2 - 1) * maxZ,
  ];
}

function sampleInside(
  cell: Point,
  footprint: ScatterFootprint,
  random: SeededRandom,
  inset: number,
): Point | undefined {
  const halfX = footprint.width / 2;
  const halfZ = footprint.depth / 2;
  const minX = cell[0] + inset + halfX;
  const maxX = cell[0] + 1 - inset - halfX;
  const minZ = cell[1] + inset + halfZ;
  const maxZ = cell[1] + 1 - inset - halfZ;
  if (maxX < minX || maxZ < minZ) return undefined;
  return [minX + random.float() * (maxX - minX), minZ + random.float() * (maxZ - minZ)];
}

function separated(position: Point, radius: number, placed: readonly ScatterSample[]): boolean {
  for (const other of placed) {
    const dx = position[0] - other.position[0];
    const dz = position[1] - other.position[1];
    const minSep = CLUSTER_MIN_SEP + radius + other.radius;
    if (dx * dx + dz * dz < minSep * minSep) return false;
  }
  return true;
}

/** Dart-throwing sample inside a cell; rejects occupant AABB overlap and in-cell crowding. */
export function tryScatterPoint(
  cell: Point,
  footprint: ScatterFootprint,
  random: SeededRandom,
  blockers: readonly ScatterAabb[],
  placed: readonly ScatterSample[],
  attempts = MAX_DART_ATTEMPTS,
): Point | undefined {
  const radius = scatterRadius(footprint);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const position = sampleInside(cell, footprint, random, OCCUPANT_INSET);
    if (!position) return undefined;
    const aabb = aabbFor(position, footprint);
    if (!aabbInsideCell(aabb, cell)) continue;
    if (blockers.some((blocker) => aabbsOverlap(aabb, blocker))) continue;
    if (!separated(position, radius, placed)) continue;
    return position;
  }
  return undefined;
}
