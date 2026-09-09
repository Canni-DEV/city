export type CameraMode = "cityOrbit" | "freeFlight" | "npcFollow";

/** Initial follow offset from the interpolated hip/root (REN-011 / M3.8). */
export const NPC_FOLLOW_OFFSET = [2.3, 1.3, 3] as const;

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

export function offsetNpcFollowCamera(
  target: { x: number; y: number; z: number },
  offset: readonly [number, number, number] = NPC_FOLLOW_OFFSET,
): { x: number; y: number; z: number } {
  return {
    x: target.x + offset[0],
    y: target.y + offset[1],
    z: target.z + offset[2],
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
