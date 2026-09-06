import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assetCatalog,
  CAR_KIT_ENTRY_COUNT,
  CAR_KIT_MODELS,
  CITY_KIT_ENTRY_COUNT,
  isCityKitEntry,
} from "../src";

const charactersRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../generated/characters",
);

function animationDurations(buffer: Buffer): Record<string, number> {
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(
    buffer
      .subarray(20, 20 + jsonLength)
      .toString()
      .replaceAll("\0", "")
      .trim(),
  ) as {
    accessors?: Array<{ max?: number[] }>;
    animations?: Array<{
      name?: string;
      samplers?: Array<{ input: number }>;
    }>;
  };
  const durations: Record<string, number> = {};
  for (const animation of json.animations ?? []) {
    let max = 0;
    for (const sampler of animation.samplers ?? []) {
      const accessor = json.accessors?.[sampler.input];
      const value = accessor?.max?.[0];
      if (typeof value === "number") max = Math.max(max, value);
    }
    durations[animation.name ?? ""] = max;
  }
  return durations;
}

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

  it("exported idle/run clips are Kenney locomotion, not targeting-pose T-pose", async () => {
    const body = await readFile(path.join(charactersRoot, "character-medium.glb"));
    const run = await readFile(path.join(charactersRoot, "run.glb"));
    const idle = await readFile(path.join(charactersRoot, "idle.glb"));
    const bodyDurations = animationDurations(body);
    expect(bodyDurations.idle).toBeGreaterThan(0.5);
    expect(bodyDurations.run).toBeGreaterThan(0.5);
    expect(bodyDurations.run).toBeLessThan(2);
    expect(bodyDurations.jump).toBeGreaterThan(0.2);
    expect(animationDurations(idle).idle).toBeGreaterThan(0.5);
    expect(animationDurations(run).run).toBeGreaterThan(0.5);
  });

  it("TST-006 catalogs 11 Kenney Car Kit bodies without karts, debris, or wheels", () => {
    const cars = assetCatalog.entries.filter((entry) => entry.pack === "cars");
    expect(cars).toHaveLength(CAR_KIT_ENTRY_COUNT);
    expect(cars.map((entry) => entry.model).sort()).toEqual([...CAR_KIT_MODELS].sort());
    expect(cars.every((entry) => entry.category === "vehicle")).toBe(true);
    expect(cars.every((entry) => entry.instancing)).toBe(true);
    expect(cars.every((entry) => entry.proceduralWeight === 0)).toBe(true);
    expect(cars.every((entry) => entry.sourceFile.startsWith("assets/kenney_car-kit/"))).toBe(true);
    expect(cars.every((entry) => entry.runtimePath.endsWith(".glb"))).toBe(true);
    expect(
      cars.every(
        (entry) =>
          (entry.uniformScale ?? 1) * Math.max(entry.footprint.width, entry.footprint.depth) <=
          0.55,
      ),
    ).toBe(true);
    expect(
      assetCatalog.entries.some((entry) => /kart|debris|wheel|tractor|race/.test(entry.id)),
    ).toBe(false);
  });

  it("provides connectors for every road tile", () => {
    const roadTiles = assetCatalog.entries.filter((entry) => entry.category === "road");
    expect(roadTiles.length).toBeGreaterThan(0);
    expect(roadTiles.every((entry) => entry.connectors.length > 0)).toBe(true);
  });

  it("AST-014 measures carriageway separately from the footprint and keeps vehicle pivots", () => {
    const straight = assetCatalog.entries.find((e) => e.id === "roads:road-straight");
    const points = straight?.driveProfile?.triangles.flat() ?? [];
    expect(points.length).toBeGreaterThan(0);
    expect(Math.max(...points.map((p) => p[1]))).toBeCloseTo(0.4, 5);
    expect(Math.min(...points.map((p) => p[1]))).toBeCloseTo(-0.4, 5);
    expect(straight?.footprint.depth).toBe(1);
    const sedan = assetCatalog.entries.find((e) => e.id === "cars:sedan");
    expect(sedan?.vehicleBounds?.min[1]).toBeCloseTo(-1.3, 5);
    expect(sedan?.vehicleBounds?.max[1]).toBeCloseTo(1.25, 5);
    for (const car of assetCatalog.entries.filter((e) => e.pack === "cars")) {
      expect(car.vehicleBounds).toBeDefined();
      expect(car.vehicleBounds?.max[0]).toBeGreaterThan(car.vehicleBounds?.min[0] ?? Infinity);
    }
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
