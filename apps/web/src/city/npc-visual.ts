import { agentFootLift } from "@city/assets";
import type { NpcPose } from "@city/core";

type XzY = Pick<NpcPose, "x" | "y" | "z">;

/**
 * Procedural IK uses world positions mixed with `root.position`. The actor
 * must live in the same space as buildings (map minus half, plus sidewalk slab).
 */
export function npcScenePose(pose: XzY, mapSize: number): { x: number; y: number; z: number } {
  const half = mapSize / 2;
  return {
    x: pose.x - half,
    y: pose.y + agentFootLift(),
    z: pose.z - half,
  };
}

export function npcSceneVelocity(
  before: XzY,
  after: XzY,
  dt: number,
): { x: number; y: number; z: number } {
  if (!(dt > 0) || !Number.isFinite(dt)) return { x: 0, y: 0, z: 0 };
  return {
    x: (after.x - before.x) / dt,
    y: (after.y - before.y) / dt,
    z: (after.z - before.z) / dt,
  };
}
