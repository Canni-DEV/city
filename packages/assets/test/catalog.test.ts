import { describe, expect, it } from "vitest";
import { assetCatalog, CITY_KIT_ENTRY_COUNT, isCityKitEntry } from "../src";

describe("asset catalog", () => {
  it("TST-006 keeps exactly 213 unique city-kit GLB entries", () => {
    const cityKit = assetCatalog.entries.filter(isCityKitEntry);
    expect(cityKit).toHaveLength(CITY_KIT_ENTRY_COUNT);
    expect(new Set(cityKit.map((entry) => entry.id)).size).toBe(CITY_KIT_ENTRY_COUNT);
  });

  it("TST-006 catalogs generated protagonist GLBs and skins without packing source FBX", () => {
    const protagonists = assetCatalog.entries.filter((entry) => entry.pack === "protagonists");
    expect(protagonists.map((entry) => entry.id).sort()).toEqual([
      "protagonists:character-medium",
      "protagonists:idle",
      "protagonists:jump",
      "protagonists:run",
    ]);
    expect(protagonists.every((entry) => entry.runtimePath.endsWith(".glb"))).toBe(true);
    expect(
      protagonists.every((entry) => entry.sourceFile.startsWith("packages/assets/generated/")),
    ).toBe(true);
    expect(protagonists.every((entry) => !entry.sourceFile.endsWith(".fbx"))).toBe(true);
    const body = protagonists.find((entry) => entry.id === "protagonists:character-medium");
    expect(body?.texturePaths).toEqual([
      "runtime-assets/protagonists/skins/skaterMaleA.png",
      "runtime-assets/protagonists/skins/skaterFemaleA.png",
      "runtime-assets/protagonists/skins/cyborgFemaleA.png",
      "runtime-assets/protagonists/skins/criminalMaleA.png",
    ]);
    expect(body?.dimensions[1]).toBeCloseTo(0.32);
    expect(body?.instancing).toBe(false);
    expect(body?.proceduralWeight).toBe(0);
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
    expect(
      assetCatalog.entries.every(
        (entry) => !entry.sourceFile.endsWith(".fbx") && !entry.runtimePath.includes(".fbx"),
      ),
    ).toBe(true);
  });
});
