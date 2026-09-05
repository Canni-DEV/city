import catalogJson from "../catalog/catalog.generated.json" with { type: "json" };
import { type AssetCatalogEntry, AssetCatalogSchema, CITY_KIT_PACKS } from "./schema";

export const assetCatalog = AssetCatalogSchema.parse(catalogJson);
export const assetById = new Map(assetCatalog.entries.map((entry) => [entry.id, entry]));

export function isCityKitEntry(entry: AssetCatalogEntry): boolean {
  return (CITY_KIT_PACKS as readonly string[]).includes(entry.pack);
}

export function agentUniformScale(entry: AssetCatalogEntry): number {
  return entry.uniformScale ?? 1;
}

export function runtimeAssetUrl(entryPath: string, baseUrl = "/city/"): string {
  return `${baseUrl.replace(/\/$/, "")}/${entryPath.replace(/^\//, "")}`;
}
