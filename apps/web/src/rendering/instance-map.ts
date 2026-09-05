import { type AssetCatalogEntry, assetById } from "@city/assets";
import type { CityDocumentV1, CityEntity } from "@city/core";

export interface RenderItem {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface RenderBatch {
  key: string;
  assetId: string;
  variant: string;
  texturePath: string;
  items: RenderItem[];
}

export interface InstanceLookup {
  entityToInstance: Map<string, { key: string; instanceId: number }>;
  instanceToEntity: Map<string, string>;
}

export function textureVariantFor(theme: string): string {
  if (theme === "variation-a" || theme === "variation-b" || theme === "variation-c") return theme;
  return "colormap";
}

export function variantTexturePath(entry: AssetCatalogEntry, variant: string): string {
  return (
    entry.texturePaths.find((path) => path.endsWith(`/${variant}.png`)) ??
    entry.texturePaths.find((path) => path.endsWith("/colormap.png")) ??
    entry.texturePaths[0] ??
    ""
  );
}

function themeFor(document: CityDocumentV1, entity: CityEntity): string {
  if (entity.districtId) {
    const district = document.districts.find((entry) => entry.id === entity.districtId);
    if (district?.theme) return district.theme;
  }
  return document.generator.parameters.colorTheme;
}

/** REN-004: stable batches by render asset and texture variant. */
export function buildEntityBatches(
  document: CityDocumentV1,
  options: { useLod: boolean; showDecoration: boolean },
): { batches: RenderBatch[] } & InstanceLookup {
  const groups = new Map<
    string,
    { assetId: string; variant: string; texturePath: string; entities: CityEntity[] }
  >();
  const entities = Object.values(document.entities).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  for (const entity of entities) {
    const entry = assetById.get(entity.assetId);
    if (!entry) continue;
    if (!options.showDecoration && entry.decoration) continue;
    const renderId = options.useLod && entry.lodModelId ? entry.lodModelId : entity.assetId;
    const renderEntry = assetById.get(renderId) ?? entry;
    const variant = textureVariantFor(themeFor(document, entity));
    const key = `${renderId}::${variant}`;
    const group = groups.get(key) ?? {
      assetId: renderId,
      variant,
      texturePath: variantTexturePath(renderEntry, variant),
      entities: [],
    };
    group.entities.push(entity);
    groups.set(key, group);
  }

  const entityToInstance = new Map<string, { key: string; instanceId: number }>();
  const instanceToEntity = new Map<string, string>();
  const batches: RenderBatch[] = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => {
      const items = group.entities.map((entity, instanceId) => {
        entityToInstance.set(entity.id, { key, instanceId });
        instanceToEntity.set(`${key}:${instanceId}`, entity.id);
        return {
          id: entity.id,
          position: entity.transform.position,
          rotation: entity.transform.rotation,
          scale: entity.transform.scale,
        };
      });
      return {
        key,
        assetId: group.assetId,
        variant: group.variant,
        texturePath: group.texturePath,
        items,
      };
    });
  return { batches, entityToInstance, instanceToEntity };
}

export function buildRoadBatches(document: CityDocumentV1): RenderBatch[] {
  const groups = new Map<string, RenderItem[]>();
  for (const cell of [...document.roadGraph.cells].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const entry = assetById.get(cell.assetId);
    const width = entry?.footprint.width ?? 1;
    const depth = entry?.footprint.depth ?? 1;
    const swap = cell.rotation === 90 || cell.rotation === 270;
    const alongX = swap ? depth : width;
    const alongZ = swap ? width : depth;
    const items = groups.get(cell.assetId) ?? [];
    items.push({
      id: cell.id,
      position: [cell.position[0] + alongX / 2, 0.015, cell.position[1] + alongZ / 2],
      rotation: [0, cell.rotation, 0],
      scale: [1, 1, 1],
    });
    groups.set(cell.assetId, items);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([assetId, items]) => {
      const entry = assetById.get(assetId);
      return {
        key: `road:${assetId}`,
        assetId,
        variant: "colormap",
        texturePath: entry ? variantTexturePath(entry, "colormap") : "",
        items,
      };
    });
}

export function buildSidewalkBatches(document: CityDocumentV1): RenderBatch[] {
  const groups = new Map<string, RenderItem[]>();
  for (const cell of [...document.sidewalks].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const items = groups.get(cell.assetId) ?? [];
    items.push({
      id: cell.id,
      position: [cell.position[0] + 0.5, 0.02, cell.position[1] + 0.5],
      rotation: [0, cell.rotation, 0],
      scale: [1, 1, 1],
    });
    groups.set(cell.assetId, items);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([assetId, items]) => {
      const entry = assetById.get(assetId);
      return {
        key: `sidewalk:${assetId}`,
        assetId,
        variant: "colormap",
        texturePath: entry ? variantTexturePath(entry, "colormap") : "",
        items,
      };
    });
}

export function instanceLookupKey(batchKey: string, instanceId: number): string {
  return `${batchKey}:${instanceId}`;
}
