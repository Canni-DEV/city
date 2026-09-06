import { describe, expect, it } from "vitest";
import { buildDriveSurface, curveFitsSurface } from "../src/drive-surface.js";
import {
  buildDriveNetwork,
  CityDocumentSchema,
  type CityDocumentV1,
  createDriveCurve,
  createEmptyCityDocument,
  cubicTangent,
  DEFAULT_VEHICLE_SPEED,
  findNetworkPath,
  hashGeneratedStructure,
  type Point,
  PRESET_PARAMETERS,
  resolveRoadTopology,
  sampleDriveCurve,
  sampleDriveSegment,
  spawnVehicles,
  tickVehicles,
  vehicleCountFor,
  vehicleWorldPose,
} from "../src/index.js";
import { TEST_ASSETS } from "./catalog-assets.js";

function fixture(tiles: [number, number, string, number?][], gates: Point[]): CityDocumentV1 {
  const d = createEmptyCityDocument({
    id: "fixture",
    name: "Fixture",
    seed: "vehicles",
    timestamp: "2026-09-06T00:00:00Z",
    parameters: PRESET_PARAMETERS.balanced,
  });
  d.map.boundaryMask = Array(d.map.size ** 2).fill(true);
  d.roadGraph.cells = tiles.map(([x, z, asset, rotation = 0], i) => ({
    id: `tile:${i}`,
    position: [x, z],
    assetId: `roads:${asset}`,
    rotation,
    roadClass: "local",
  }));
  d.roadGraph.nodes = gates.map((position, i) => ({ id: `gate:${i}`, kind: "gate", position }));
  d.roadGraph.topology = resolveRoadTopology(d, TEST_ASSETS);
  return d;
}
function straight() {
  return fixture(
    [0, 1, 2, 3, 4, 5].map((x) => [x, 4, "road-straight"]),
    [
      [0, 4],
      [5, 4],
    ],
  );
}
function cross() {
  return fixture(
    [
      [4, 4, "road-crossroad-path"],
      [2, 4, "road-straight"],
      [3, 4, "road-straight"],
      [5, 4, "road-straight"],
      [6, 4, "road-straight"],
      [4, 2, "road-straight", 90],
      [4, 3, "road-straight", 90],
      [4, 5, "road-straight", 90],
      [4, 6, "road-straight", 90],
    ],
    [
      [2, 4],
      [6, 4],
      [4, 2],
      [4, 6],
    ],
  );
}

describe("TST-009 explicit runtime lanes", () => {
  it("joins curves exactly, starts steering in the approach and follows the derivative", () => {
    const d = cross(),
      n = buildDriveNetwork(d, TEST_ASSETS);
    expect(n.validation.issues).toEqual([]);
    const turn = n.segments.find((s) => s.kind === "turn");
    expect(turn).toBeDefined();
    if (!turn) return;
    const start = sampleDriveSegment(turn, 0),
      end = sampleDriveSegment(turn, turn.length);
    expect(start.x < 4 || start.x > 5 || start.z < 4 || start.z > 5).toBe(true);
    for (const id of turn.successors) {
      const next = sampleDriveSegment(n.byId.get(id)!, 0);
      expect(next.x).toBeCloseTo(end.x, 8);
      expect(next.z).toBeCloseTo(end.z, 8);
      expect(Math.cos(next.yaw - end.yaw)).toBeCloseTo(1, 8);
    }
    for (const c of turn.curves) {
      expect(sampleDriveCurve(c, 0).x).toBe(c.controls[0][0]);
      expect(sampleDriveCurve(c, c.length).x).toBeCloseTo(c.controls[3][0], 10);
      const tangent = cubicTangent(c.controls, 0.5),
        point = sampleDriveCurve(c, c.samples.find((s) => s.t === 0.5)?.distance ?? c.length / 2);
      expect(Number.isFinite(point.yaw)).toBe(true);
      expect(Math.hypot(...tangent)).toBeCloseTo(1, 10);
    }
  });
  it("validates both senses, reachable length-weighted routes, and bounded portals", () => {
    const n = buildDriveNetwork(straight(), TEST_ASSETS);
    expect(n.validation.issues).toEqual([]);
    expect(n.topology.portals).toHaveLength(2);
    expect(n.entrances).toHaveLength(2);
    for (const from of n.entrances) {
      const exits = [...n.exits].map((to) => findNetworkPath(n, from, to)).filter(Boolean);
      expect(exits).toHaveLength(1);
    }
    expect(n.segments.every((s) => s.successors.length > 0 || n.exits.has(s.id))).toBe(true);
  });
  it("has a shared CCW roundabout ring with tangent joins and no island traversal", () => {
    const d = fixture(
      [
        [3, 3, "road-roundabout"],
        [1, 4, "road-straight"],
        [2, 4, "road-straight"],
        [6, 4, "road-straight"],
        [7, 4, "road-straight"],
        [4, 1, "road-straight", 90],
        [4, 2, "road-straight", 90],
        [4, 6, "road-straight", 90],
        [4, 7, "road-straight", 90],
      ],
      [
        [1, 4],
        [7, 4],
        [4, 1],
        [4, 7],
      ],
    );
    const n = buildDriveNetwork(d, TEST_ASSETS);
    expect(n.validation.issues).toEqual([]);
    const ring = n.segments.filter((s) => s.kind === "ring");
    expect(ring).toHaveLength(8);
    for (const s of ring) {
      const p = sampleDriveSegment(s, s.length / 2);
      expect(Math.hypot(p.x - 4.5, p.z - 4.5)).toBeGreaterThan(0.7);
      expect((p.z - 4.5) * Math.sin(p.yaw) - (p.x - 4.5) * Math.cos(p.yaw)).toBeGreaterThan(0);
    }
  });
  it("rejects missing openings and a path whose center fits but whose body crosses a curb", () => {
    const d = straight(),
      surface = buildDriveSurface(d, TEST_ASSETS);
    const c = createDriveCurve([
      [1, 4.79],
      [1.3, 4.79],
      [1.7, 4.79],
      [2, 4.79],
    ]);
    expect(curveFitsSurface(c.controls, { min: [-0.2, -0.34], max: [0.2, 0.34] }, surface)).toBe(
      false,
    );
    const bad = fixture([[3, 3, "road-straight"]], []),
      n = buildDriveNetwork(bad, TEST_ASSETS);
    expect(n.validation.valid).toBe(false);
    expect(spawnVehicles({ seed: "x", network: n, count: 8 })).toEqual([]);
  });
  it("reconstructs identical networks without persisting runtime state", () => {
    const d = cross(),
      before = JSON.stringify(d),
      hash = hashGeneratedStructure(d),
      n = buildDriveNetwork(d, TEST_ASSETS);
    const restored = CityDocumentSchema.parse(JSON.parse(before));
    expect(buildDriveNetwork(restored, TEST_ASSETS).segments).toEqual(n.segments);
    let vehicles = spawnVehicles({ seed: d.generator.seed, network: n, count: 8 });
    expect(vehicles).toEqual(spawnVehicles({ seed: d.generator.seed, network: n, count: 8 }));
    for (let i = 0; i < 100; i++)
      vehicles = tickVehicles(vehicles, { seed: d.generator.seed, network: n, dt: 0.1 });
    expect(JSON.stringify(d)).toBe(before);
    expect(hashGeneratedStructure(d)).toBe(hash);
    expect(before).not.toContain('"segmentId"');
  });
  it("consumes multiple segments and portal transitions without frame-distance loss", () => {
    const n = buildDriveNetwork(straight(), TEST_ASSETS),
      vehicles = spawnVehicles({ seed: "steps", network: n, count: 2 });
    expect(vehicles).toHaveLength(2);
    const once = tickVehicles(vehicles, { seed: "steps", network: n, dt: 20, speed: 1 });
    let split = vehicles;
    for (let i = 0; i < 200; i++)
      split = tickVehicles(split, { seed: "steps", network: n, dt: 0.1, speed: 1 });
    for (let i = 0; i < once.length; i++) {
      expect(once[i]!.segmentId).toBe(split[i]!.segmentId);
      expect(once[i]!.distance).toBeCloseTo(split[i]!.distance, 8);
      expect(once[i]!.portalCount).toBeGreaterThan(0);
      const p = vehicleWorldPose(once[i]!, n);
      expect(Number.isFinite(p.yaw)).toBe(true);
    }
    expect(() => tickVehicles(vehicles, { seed: "x", network: n, dt: Infinity })).toThrow();
  });
  it("retains the SIM-016 budget and SIM-014 ghost motion", () => {
    expect(vehicleCountFor(96, "high")).toBe(12);
    expect(DEFAULT_VEHICLE_SPEED).toBeCloseTo((1.85 / 3) * 2);
    const n = buildDriveNetwork(straight(), TEST_ASSETS),
      v = spawnVehicles({ seed: "ghost", network: n, count: 1 })[0]!;
    const result = tickVehicles([v, { ...v, id: "duplicate" }], {
      seed: "ghost",
      network: n,
      dt: 0.1,
    });
    expect(vehicleWorldPose(result[0]!, n)).toEqual(vehicleWorldPose(result[1]!, n));
  });
});
