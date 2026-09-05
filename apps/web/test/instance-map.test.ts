import { createEmptyCityDocument, PRESET_PARAMETERS } from "@city/core";
import { describe, expect, it } from "vitest";
import {
  buildEntityBatches,
  buildRoadBatches,
  textureVariantFor,
} from "../src/rendering/instance-map";

describe("REN-004 instance mapping", () => {
  it("groups by asset and variant with a stable bidirectional instance map", () => {
    const document = createEmptyCityDocument({
      id: "city-instances",
      name: "Instances",
      seed: "instances",
      parameters: PRESET_PARAMETERS.balanced,
      timestamp: "2026-09-05T00:00:00.000Z",
    });
    document.districts = [{ id: "district-a", center: [4, 4], theme: "variation-a" }];
    document.entities = {
      proc_b: {
        id: "proc_b",
        assetId: "suburban:building-type-a",
        districtId: "district-a",
        blockId: null,
        lotId: null,
        zone: "suburban",
        transform: { position: [2.5, 0, 2.5], rotation: [0, 0, 0], scale: [1, 1, 1] },
        footprint: { width: 1, depth: 1, clearance: 0 },
        origin: "procedural",
        editState: "generated",
        zoneCompatibilityWarning: false,
      },
      proc_a: {
        id: "proc_a",
        assetId: "suburban:building-type-a",
        districtId: "district-a",
        blockId: null,
        lotId: null,
        zone: "suburban",
        transform: { position: [1.5, 0, 1.5], rotation: [0, 90, 0], scale: [1, 1, 1] },
        footprint: { width: 1, depth: 1, clearance: 0 },
        origin: "procedural",
        editState: "generated",
        zoneCompatibilityWarning: false,
      },
    };
    const mapped = buildEntityBatches(document, { useLod: false, showDecoration: true });
    expect(mapped.batches).toHaveLength(1);
    expect(mapped.batches[0]?.items.map((item) => item.id)).toEqual(["proc_a", "proc_b"]);
    expect(mapped.entityToInstance.get("proc_a")).toEqual({
      key: "suburban:building-type-a::variation-a",
      instanceId: 0,
    });
    expect(mapped.instanceToEntity.get("suburban:building-type-a::variation-a:0")).toBe("proc_a");
    expect(textureVariantFor("variation-b")).toBe("variation-b");
  });

  it("REN-008 swaps to LOD assets and can hide decoration without changing the document", () => {
    const document = createEmptyCityDocument({
      id: "city-lod",
      name: "LOD",
      seed: "lod",
      parameters: PRESET_PARAMETERS.balanced,
      timestamp: "2026-09-05T00:00:00.000Z",
    });
    document.entities = {
      building: {
        id: "building",
        assetId: "commercial:building-a",
        districtId: null,
        blockId: null,
        lotId: null,
        zone: "commercial",
        transform: { position: [1.5, 0, 1.5], rotation: [0, 0, 0], scale: [1, 1, 1] },
        footprint: { width: 1, depth: 1, clearance: 0 },
        origin: "procedural",
        editState: "generated",
        zoneCompatibilityWarning: false,
      },
      tree: {
        id: "tree",
        assetId: "suburban:tree-small",
        districtId: null,
        blockId: null,
        lotId: null,
        zone: "park",
        transform: { position: [3.5, 0, 3.5], rotation: [0, 0, 0], scale: [1, 1, 1] },
        footprint: { width: 0.2, depth: 0.2, clearance: 0 },
        origin: "procedural",
        editState: "generated",
        zoneCompatibilityWarning: false,
      },
    };
    const low = buildEntityBatches(document, { useLod: true, showDecoration: false });
    expect(low.batches).toHaveLength(1);
    expect(low.batches[0]?.assetId).toBe("commercial:low-detail-building-a");
    expect(document.entities.tree?.assetId).toBe("suburban:tree-small");
    expect(document.entities.building?.assetId).toBe("commercial:building-a");
  });

  it("centers multi-cell road tiles on their catalog footprint", () => {
    const document = createEmptyCityDocument({
      id: "city-roads",
      name: "Roads",
      seed: "roads",
      parameters: PRESET_PARAMETERS.balanced,
      timestamp: "2026-09-05T00:00:00.000Z",
    });
    document.roadGraph.cells = [
      {
        id: "curve",
        position: [10, 20],
        assetId: "roads:road-curve",
        rotation: 0,
      },
      {
        id: "straight",
        position: [3, 4],
        assetId: "roads:road-straight",
        rotation: 90,
      },
    ];
    const batches = buildRoadBatches(document);
    const curve = batches.find((batch) => batch.assetId === "roads:road-curve")?.items[0];
    const straight = batches.find((batch) => batch.assetId === "roads:road-straight")?.items[0];
    expect(curve?.position).toEqual([11, 0.015, 21]);
    expect(straight?.position).toEqual([3.5, 0.015, 4.5]);
  });
});
