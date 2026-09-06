import { describe, expect, it } from "vitest";
import {
  buildDriveNetwork,
  buildPedestrianNetwork,
  canEnterNpcCrossing,
  createEmptyCityDocument,
  createNpcWorld,
  issueNpcOrder,
  type Point,
  PRESET_PARAMETERS,
  resizeNpcPopulation,
  resolveRoadTopology,
  SIMULATION_STEP,
  tickNpcWorld,
  tickVehicles,
  type VehicleRuntimeState,
  vehicleWorldPose,
} from "../src/index.js";
import { TEST_ASSETS } from "./catalog-assets.js";

function crossingFixture(width = 1) {
  const city = createEmptyCityDocument({
    id: "crossing-test",
    name: "Crossing",
    seed: "traffic",
    timestamp: "2026-09-06T00:00:00Z",
    parameters: PRESET_PARAMETERS.balanced,
  });
  city.map.boundaryMask.fill(true);
  for (let z = 4; z < 4 + width; z++)
    for (let x = 1; x <= 8; x++)
      city.roadGraph.cells.push({
        id: `road:${x},${z}`,
        position: [x, z],
        assetId: x === 4 ? "roads:road-crossroad-path" : "roads:road-straight",
        rotation: 0,
      });
  city.roadGraph.nodes = [
    [1, 4],
    [8, 4],
  ].map((position, i) => ({ id: `gate:${i}`, kind: "gate", position: position as Point }));
  city.roadGraph.topology = resolveRoadTopology(city, TEST_ASSETS);
  city.sidewalks = [
    [4, 3],
    [4, 4 + width],
  ].map((position, i) => ({
    id: `s${i}`,
    blockId: "b",
    position: position as Point,
    rotation: 0,
    assetId: "roads:tile-low",
  }));
  return city;
}
describe("TST-008 safe complete crossing admission", () => {
  it("crosses local streets and two-cell avenues without pausing on the carriageway", () => {
    for (const width of [1, 2]) {
      const city = crossingFixture(width),
        network = buildPedestrianNetwork(city),
        world = createNpcWorld("traffic");
      resizeNpcPopulation(world, network, 1);
      world.poses.set("npc:0", { x: 4.5, z: 3.5, y: 0.025, yaw: 0, speed: 0 });
      issueNpcOrder(world, network, "npc:0", { kind: "moveTo", point: [4.5, 4.5 + width] });
      for (let i = 0; i < 2000; i++) {
        tickNpcWorld(world, network, SIMULATION_STEP);
        const p = world.poses.get("npc:0");
        if (p && p.z > 4 && p.z < 4 + width) {
          expect(p.speed).toBeGreaterThan(0);
          expect(world.crossing.get("npc:0")?.active).not.toBeNull();
        }
      }
      expect(world.behavior.get("npc:0")?.status).toBe("completed");
    }
  });
  it("predicts vehicle segment changes and portals without mutating live traffic", () => {
    const city = crossingFixture(),
      network = buildPedestrianNetwork(city),
      drive = buildDriveNetwork(city, TEST_ASSETS),
      world = createNpcWorld("traffic");
    resizeNpcPopulation(world, network, 1);
    // The through lane exists even in a fixture with unconnected junction side ports.
    const segment = drive.segments.find(
      (s) =>
        s.kind === "lane" &&
        s.curves.some((c) => c.controls[0][0] < 4 && c.controls[3][0] > c.controls[0][0]),
    );
    expect(segment).toBeDefined();
    if (!segment) return;
    const vehicles: VehicleRuntimeState[] = [
      {
        id: "vehicle:0",
        index: 0,
        assetId: "cars:firetruck" as const,
        segmentId: segment.id,
        distance: 0,
        route: [],
        destination: segment.id,
        destinationCount: 0,
        portalCount: 0,
        speed: 0,
      },
    ];
    const before = JSON.stringify(vehicles);
    const leg = {
      crossingId: "test",
      points: [
        [4.5, 3.5],
        [4.5, 5.5],
      ] as Point[],
      length: 2,
    };
    expect(
      canEnterNpcCrossing(world, "npc:0", leg, {
        network: drive,
        vehicles,
        bodyRadii: new Map([["cars:firetruck", 0.5]]),
      }),
    ).toBe(false);
    expect(JSON.stringify(vehicles)).toBe(before);
    let predicted = vehicles;
    for (let i = 0; i < 200; i++)
      predicted = tickVehicles(predicted, { network: drive, seed: "traffic", dt: 0.1 });
    expect(predicted[0]?.portalCount).toBeGreaterThan(0);
    expect(
      Number.isFinite(vehicleWorldPose(predicted[0] as (typeof vehicles)[number], drive).x),
    ).toBe(true);
  });
  it("finishes a crossing before activating a pending wait order", () => {
    const city = crossingFixture(),
      network = buildPedestrianNetwork(city),
      world = createNpcWorld("traffic");
    resizeNpcPopulation(world, network, 1);
    world.poses.set("npc:0", { x: 4.5, z: 3.5, y: 0.025, yaw: 0, speed: 0 });
    issueNpcOrder(world, network, "npc:0", { kind: "moveTo", point: [4.5, 5.5] });
    for (let i = 0; i < 150; i++) tickNpcWorld(world, network, SIMULATION_STEP);
    expect(world.crossing.get("npc:0")?.active).not.toBeNull();
    expect(issueNpcOrder(world, network, "npc:0", { kind: "wait", seconds: 1 })).toBe("pending");
    for (let i = 0; i < 1500; i++) tickNpcWorld(world, network, SIMULATION_STEP);
    expect(world.crossing.get("npc:0")?.active).toBeNull();
    expect(world.behavior.get("npc:0")?.status).toBe("completed");
    expect(world.poses.get("npc:0")?.z).toBeGreaterThan(5);
  });
});
