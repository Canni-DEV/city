import { describe, expect, it } from "vitest";
import {
  advanceSimulationClock,
  buildPedestrianNetwork,
  cancelNpcOrder,
  canEnterNpcCrossing,
  createEmptyCityDocument,
  createNpcWorld,
  distance2,
  findPedestrianRoute,
  issueNpcOrder,
  NPC_RADIUS,
  npcDiagnostics,
  type Point,
  PRESET_PARAMETERS,
  resizeNpcPopulation,
  SIMULATION_STEP,
  tickNpcWorld,
} from "../src/index.js";

function fixture(cells: Point[] = Array.from({ length: 8 }, (_, i) => [i + 2, 3] as Point)) {
  const city = createEmptyCityDocument({
    id: "npc-test",
    name: "NPC",
    seed: "npc",
    timestamp: "2026-09-06T00:00:00Z",
    parameters: PRESET_PARAMETERS.balanced,
  });
  city.map.boundaryMask.fill(true);
  city.sidewalks = cells.map((position, i) => ({
    id: `s${i}`,
    blockId: "block",
    position,
    rotation: 0,
    assetId: "roads:tile-low",
  }));
  return city;
}
function setup(cells?: Point[], count = 1) {
  const city = fixture(cells),
    network = buildPedestrianNetwork(city),
    world = createNpcWorld("npc");
  resizeNpcPopulation(world, network, count);
  return { city, network, world };
}
function place(world: ReturnType<typeof createNpcWorld>, id: string, point: Point, yaw = 0) {
  world.poses.set(id, { x: point[0], z: point[1], y: 0.025, yaw, speed: 0 });
  const b = world.behavior.get(id);
  if (b) b.wander = false;
}
describe("TST-008 M3.6.3 continuous NPC components", () => {
  it("walks a complete route without jumps, including a right-angle corner and arrival", () => {
    const { world, network } = setup([
      [2, 3],
      [3, 3],
      [4, 3],
      [4, 4],
      [4, 5],
    ]);
    place(world, "npc:0", [2.5, 3.5], Math.PI / 2);
    expect(issueNpcOrder(world, network, "npc:0", { kind: "moveTo", point: [4.5, 5.5] })).toBe(
      "active",
    );
    for (let i = 0; i < 2400; i++) {
      const before = world.poses.get("npc:0");
      tickNpcWorld(world, network, SIMULATION_STEP);
      const after = world.poses.get("npc:0");
      expect(
        distance2([before?.x ?? 0, before?.z ?? 0], [after?.x ?? 0, after?.z ?? 0]),
      ).toBeLessThanOrEqual(0.37 * SIMULATION_STEP);
      expect(network.safe([after?.x ?? 0, after?.z ?? 0])).toBe(true);
    }
    expect(world.behavior.get("npc:0")?.status).toBe("completed");
    expect(
      distance2([world.poses.get("npc:0")?.x ?? 0, world.poses.get("npc:0")?.z ?? 0], [4.5, 5.5]),
    ).toBeLessThan(0.03);
  });
  it("turns 180 degrees continuously and completes wait/cancel/invalid orders", () => {
    const { world, network } = setup();
    place(world, "npc:0", [5.5, 3.5], Math.PI / 2);
    issueNpcOrder(world, network, "npc:0", { kind: "moveTo", point: [2.5, 3.5] });
    for (let i = 0; i < 60; i++) {
      const yaw = world.poses.get("npc:0")?.yaw ?? 0;
      tickNpcWorld(world, network, SIMULATION_STEP);
      expect(Math.abs((world.poses.get("npc:0")?.yaw ?? 0) - yaw)).toBeLessThanOrEqual(
        Math.PI * SIMULATION_STEP + 1e-8,
      );
    }
    cancelNpcOrder(world, "npc:0");
    expect(world.behavior.get("npc:0")?.status).toBe("cancelled");
    issueNpcOrder(world, network, "npc:0", { kind: "wait", seconds: 0.2 });
    for (let i = 0; i < 12; i++) tickNpcWorld(world, network, SIMULATION_STEP);
    expect(world.behavior.get("npc:0")?.status).toBe("completed");
    expect(issueNpcOrder(world, network, "npc:0", { kind: "moveTo", point: [30, 30] })).toBe(
      "failed",
    );
    expect(issueNpcOrder(world, network, "npc:0", { kind: "wait", seconds: Number.NaN })).toBe(
      "failed",
    );
  });
  it("opposing walkers pass without swept body overlap", () => {
    const { world, network } = setup(undefined, 2);
    place(world, "npc:0", [2.5, 3.5], Math.PI / 2);
    place(world, "npc:1", [8.5, 3.5], -Math.PI / 2);
    issueNpcOrder(world, network, "npc:0", { kind: "moveTo", point: [8.5, 3.5] });
    issueNpcOrder(world, network, "npc:1", { kind: "moveTo", point: [2.5, 3.5] });
    for (let i = 0; i < 3000; i++) {
      tickNpcWorld(world, network, SIMULATION_STEP);
      const a = world.poses.get("npc:0"),
        b = world.poses.get("npc:1");
      expect(distance2([a?.x ?? 0, a?.z ?? 0], [b?.x ?? 0, b?.z ?? 0])).toBeGreaterThanOrEqual(
        NPC_RADIUS * 2 - 1e-8,
      );
    }
    expect(world.behavior.get("npc:0")?.status).toBe("completed");
    expect(world.behavior.get("npc:1")?.status).toBe("completed");
  });
  it("preserves survivors when population changes and does not mutate the document", () => {
    const { world, network, city } = setup(undefined, 2),
      json = JSON.stringify(city);
    tickNpcWorld(world, network, SIMULATION_STEP);
    const pose = world.poses.get("npc:0"),
      behavior = world.behavior.get("npc:0");
    resizeNpcPopulation(world, network, 4);
    expect(world.poses.get("npc:0")).toBe(pose);
    expect(world.behavior.get("npc:0")).toBe(behavior);
    resizeNpcPopulation(world, network, 1);
    expect(world.ids).toEqual(["npc:0"]);
    expect(JSON.stringify(city)).toBe(json);
  });
  it("reconstructs and navigates parks around footprints while excluding isolated regions", () => {
    const city = fixture([
      [2, 3],
      [3, 3],
      [4, 3],
    ]);
    city.blocks = [
      {
        id: "park",
        districtId: "district",
        zone: "park",
        regenerationIndex: 0,
        cells: [
          [3, 4],
          [4, 4],
          [3, 5],
          [4, 5],
          [20, 20],
        ],
      },
    ];
    city.entities.tree = {
      id: "tree",
      assetId: "tree",
      districtId: null,
      blockId: "park",
      lotId: null,
      zone: "park",
      origin: "procedural",
      editState: "generated",
      zoneCompatibilityWarning: false,
      footprint: { width: 0.4, depth: 0.4, clearance: 0 },
      transform: { position: [3.5, 0, 4.5], rotation: [0, 30, 0], scale: [1, 1, 1] },
    };
    const network = buildPedestrianNetwork(city),
      rebuilt = buildPedestrianNetwork(city);
    expect([...network.nodes.keys()]).toEqual([...rebuilt.nodes.keys()]);
    expect(network.safe([3.5, 4.5])).toBe(false);
    expect(network.blocked.length).toBeGreaterThan(0);
    expect([...network.nodes.values()].some((n) => n.point[0] > 19)).toBe(false);
    const goal = [...network.nodes.values()].find((n) => n.point[1] > 5 && n.kind === "park");
    expect(goal).toBeDefined();
    expect(findPedestrianRoute(network, "s:3,3", goal?.id ?? "")).toBeDefined();
  });
  it("rejects crossing admission when another NPC occupies the exit", () => {
    const { world } = setup(undefined, 2);
    place(world, "npc:1", [5.5, 3.5]);
    expect(
      canEnterNpcCrossing(world, "npc:0", {
        points: [
          [2.5, 3.5],
          [5.5, 3.5],
        ],
        crossingId: "cross",
        length: 3,
      }),
    ).toBe(false);
    resizeNpcPopulation(world, buildPedestrianNetwork(fixture()), 1);
    expect(
      canEnterNpcCrossing(world, "npc:0", {
        points: [
          [2.5, 3.5],
          [5.5, 3.5],
        ],
        crossingId: "cross",
        length: 3,
      }),
    ).toBe(true);
  });
  it("uses a fixed clock with retained backlog, reproducible partitions, pause and step", () => {
    const run = (deltas: number[]) => {
      const { world, network } = setup();
      const clock = { accumulator: 0, ticks: 0 };
      for (const dt of deltas)
        advanceSimulationClock(clock, dt, () => tickNpcWorld(world, network, SIMULATION_STEP));
      while (clock.accumulator >= SIMULATION_STEP - 1e-10)
        advanceSimulationClock(clock, 0, () => tickNpcWorld(world, network, SIMULATION_STEP));
      return npcDiagnostics(world);
    };
    expect(run(Array(120).fill(1 / 60))).toEqual(run([0.7, 0.8, 0.5]));
    const clock = { accumulator: 0, ticks: 0 };
    let calls = 0;
    advanceSimulationClock(clock, 1, () => calls++);
    expect(calls).toBe(8);
    expect(clock.accumulator).toBeGreaterThan(0.8);
    advanceSimulationClock(clock, 5, () => calls++, true);
    expect(calls).toBe(8);
    advanceSimulationClock(clock, 0, () => calls++, true, true);
    expect(calls).toBe(9);
  });
});
