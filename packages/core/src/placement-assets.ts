import type { ZoneType } from "./domain.js";
import type { DriveAsset } from "./drive-contracts.js";

export interface PlacementAsset extends DriveAsset {
  id: string;
  category: string;
  subcategory: string;
  pack: string;
  footprint: { width: number; depth: number };
  verticalOffset: number;
  front: string;
  compatibleZones: readonly string[];
  proceduralWeight: number;
  decoration: boolean;
  elevated: boolean;
  availableInV1: boolean;
}

export function usablePlacementAssets(assets: readonly PlacementAsset[]): PlacementAsset[] {
  return assets.filter(
    (asset) => asset.availableInV1 && !asset.elevated && asset.proceduralWeight > 0,
  );
}

export function assetFitsZone(asset: PlacementAsset, zone: ZoneType): boolean {
  return asset.compatibleZones.includes(zone);
}
