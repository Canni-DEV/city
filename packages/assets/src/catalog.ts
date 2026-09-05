import catalogJson from "../catalog/catalog.generated.json" with { type: "json" };
import { AssetCatalogSchema } from "./schema";

export const assetCatalog = AssetCatalogSchema.parse(catalogJson);
export const assetById = new Map(assetCatalog.entries.map((entry) => [entry.id, entry]));

export function runtimeAssetUrl(entryPath: string, baseUrl = "/city/"): string {
  return `${baseUrl.replace(/\/$/, "")}/${entryPath.replace(/^\//, "")}`;
}
