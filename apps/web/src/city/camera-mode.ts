export type CameraMode = "cityOrbit" | "freeFlight" | "npcFollow";

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
