import { describe, expect, it } from "vitest";
import { assetCatalog } from "../src";

describe("asset catalog", () => {
  it("contains every GLB model exactly once", () => {
    expect(assetCatalog.entries).toHaveLength(213);
    expect(new Set(assetCatalog.entries.map((entry) => entry.id)).size).toBe(213);
  });

  it("provides connectors for every road tile", () => {
    const roadTiles = assetCatalog.entries.filter((entry) => entry.category === "road");
    expect(roadTiles.length).toBeGreaterThan(0);
    expect(roadTiles.every((entry) => entry.connectors.length > 0)).toBe(true);
  });

  it("resolves every declared LOD relationship", () => {
    const ids = new Set(assetCatalog.entries.map((entry) => entry.id));
    const lodReferences = assetCatalog.entries.flatMap((entry) =>
      entry.lodModelId ? [entry.lodModelId] : [],
    );
    expect(lodReferences.length).toBeGreaterThan(0);
    expect(lodReferences.every((id) => ids.has(id))).toBe(true);
  });

  it("AC-012 keeps runtime copies to catalog GLB models and PNG textures", () => {
    expect(assetCatalog.entries.every((entry) => entry.runtimePath.endsWith(".glb"))).toBe(true);
    expect(
      assetCatalog.entries.every((entry) =>
        entry.texturePaths.every((path) => path.endsWith(".png")),
      ),
    ).toBe(true);
  });
});
