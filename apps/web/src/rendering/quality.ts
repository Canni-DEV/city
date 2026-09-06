import { agentCountFor, type MapSize, vehicleCountFor } from "@city/core";

export const QUALITY_PROFILES = ["auto", "low", "medium", "high"] as const;
export type QualityProfile = (typeof QUALITY_PROFILES)[number];
export type ResolvedQualityLevel = "low" | "medium" | "high";

export interface ResolvedQuality {
  resolved: ResolvedQualityLevel;
  shadows: boolean;
  shadowMapSize: number;
  fogNear: number;
  fogFar: number;
  shadowSpan: number;
  showDecoration: boolean;
  useLod: boolean;
  pixelRatioCap: number;
  agentCount: number;
  vehicleCount: number;
}

export function resolveQualityLevel(
  profile: QualityProfile,
  backend: "webgpu" | "webgl2" | "initializing",
  deviceMemory?: number,
): ResolvedQualityLevel {
  if (profile !== "auto") return profile;
  if (typeof deviceMemory === "number" && deviceMemory <= 4) return "low";
  if (backend === "webgl2") return "medium";
  return "high";
}

/** REN-008: visual settings only; never mutates CityDocumentV1. */
export function resolveQuality(
  profile: QualityProfile,
  backend: "webgpu" | "webgl2" | "initializing",
  mapSize: number,
  deviceMemory?: number,
): ResolvedQuality {
  const resolved = resolveQualityLevel(profile, backend, deviceMemory);
  const map: MapSize = mapSize === 64 || mapSize === 128 ? mapSize : 96;
  const agentCount = agentCountFor(map, resolved);
  const vehicleCount = vehicleCountFor(map, resolved);
  if (resolved === "low") {
    return {
      resolved,
      shadows: false,
      shadowMapSize: 256,
      fogNear: mapSize * 1.05,
      fogFar: mapSize * 2.15,
      shadowSpan: mapSize * 0.4,
      showDecoration: false,
      useLod: true,
      pixelRatioCap: 1,
      agentCount,
      vehicleCount,
    };
  }
  if (resolved === "medium") {
    return {
      resolved,
      shadows: true,
      shadowMapSize: 512,
      fogNear: mapSize * 1.35,
      fogFar: mapSize * 2.8,
      shadowSpan: mapSize * 0.55,
      showDecoration: true,
      useLod: true,
      pixelRatioCap: 1.5,
      agentCount,
      vehicleCount,
    };
  }
  return {
    resolved,
    shadows: true,
    shadowMapSize: 1024,
    fogNear: mapSize * 1.6,
    fogFar: mapSize * 3.3,
    shadowSpan: mapSize * 0.7,
    showDecoration: true,
    useLod: false,
    pixelRatioCap: 2,
    agentCount,
    vehicleCount,
  };
}
