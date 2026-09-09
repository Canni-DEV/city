export type CameraMode = "cityOrbit" | "freeFlight" | "npcFollow";

/** Locked third-person follow (REN-011 / M3.8.1). Distances are scene/map cells. */
export const NPC_FOLLOW_DISTANCE = 2.6;
export const NPC_FOLLOW_MIN_DISTANCE = 1.2;
export const NPC_FOLLOW_MAX_DISTANCE = 8;
export const NPC_FOLLOW_PITCH = 0.35;
export const NPC_FOLLOW_MIN_PITCH = 0.08;
export const NPC_FOLLOW_MAX_PITCH = 1.15;
export const CITY_ORBIT_MIN_ZOOM = 2;
export const CITY_ORBIT_MAX_ZOOM = 96;

export function toggleFreeFlight(mode: CameraMode, npcControlled: boolean): CameraMode {
  if (npcControlled) return mode;
  return mode === "freeFlight" ? "cityOrbit" : "freeFlight";
}

export function enterNpcFollow(hasSelectedNpc: boolean): CameraMode {
  return hasSelectedNpc ? "npcFollow" : "cityOrbit";
}

export function exitNpcControl(): CameraMode {
  return "cityOrbit";
}

export function clampNpcFollowDistance(distance: number): number {
  if (!Number.isFinite(distance)) return NPC_FOLLOW_DISTANCE;
  return Math.min(NPC_FOLLOW_MAX_DISTANCE, Math.max(NPC_FOLLOW_MIN_DISTANCE, distance));
}

export function clampNpcFollowPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return NPC_FOLLOW_PITCH;
  return Math.min(NPC_FOLLOW_MAX_PITCH, Math.max(NPC_FOLLOW_MIN_PITCH, pitch));
}

/** Camera position behind `yaw`, looking toward `target`. `lookYaw` is added to NPC yaw. */
export function npcFollowCameraPose(
  target: { x: number; y: number; z: number },
  yaw: number,
  lookYaw = 0,
  lookPitch = NPC_FOLLOW_PITCH,
  distance = NPC_FOLLOW_DISTANCE,
): { x: number; y: number; z: number } {
  const pitch = clampNpcFollowPitch(lookPitch);
  const range = clampNpcFollowDistance(distance);
  const horiz = Math.cos(pitch) * range;
  const facing = yaw + lookYaw;
  return {
    x: target.x - Math.sin(facing) * horiz,
    y: target.y + Math.sin(pitch) * range,
    z: target.z - Math.cos(facing) * horiz,
  };
}

export function behindNpcFollowOffset(
  target: { x: number; y: number; z: number },
  yaw: number,
  distance = NPC_FOLLOW_DISTANCE,
): { x: number; y: number; z: number } {
  return npcFollowCameraPose(target, yaw, 0, NPC_FOLLOW_PITCH, distance);
}

/** Exponential spring toward behind-the-NPC look (lookYaw 0, default pitch). */
export function springNpcFollowLook(
  lookYaw: number,
  lookPitch: number,
  dt: number,
): { lookYaw: number; lookPitch: number } {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const t = 1 - Math.exp(-10 * step);
  return {
    lookYaw: lookYaw + (0 - lookYaw) * t,
    lookPitch: lookPitch + (NPC_FOLLOW_PITCH - lookPitch) * t,
  };
}

/** OrbitControls produces NaN when the camera sits on its target. */
export function followFramingIsValid(
  camera: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): boolean {
  const dx = camera.x - target.x;
  const dy = camera.y - target.y;
  const dz = camera.z - target.z;
  return (
    Number.isFinite(dx) &&
    Number.isFinite(dy) &&
    Number.isFinite(dz) &&
    dx * dx + dy * dy + dz * dz > 1e-6
  );
}
