import { describe, expect, it } from "vitest";
import {
  applyNpcMotionRequest,
  buildPedestrianNetwork,
  createEmptyCityDocument,
  createNpcWorld,
  greetNpc,
  issueNpcOrder,
  type Point,
  PRESET_PARAMETERS,
  releaseNpcControl,
  resizeNpcPopulation,
  resolveNpcOrchestrationConfig,
  resolveRoadTopology,
  SIMULATION_STEP,
  setNpcControlInput,
  stopNpc,
  takeNpcControl,
  tickNpcWorld,
} from "../src/index.js";
import { TEST_ASSETS } from "./catalog-assets.js";

function setup(count = 1) {
  const city = createEmptyCityDocument({
    id: "m3-8",
    name: "Animation orchestration",
    seed: "m3-8",
    timestamp: "2026-09-08T00:00:00Z",
    parameters: PRESET_PARAMETERS.balanced,
  });
  city.map.boundaryMask.fill(true);
  city.sidewalks = Array.from({ length: 10 }, (_, index) => ({
    id: `sidewalk:${index}`,
    blockId: "block",
    position: [index + 2, 3] as Point,
    rotation: 0,
    assetId: "roads:tile-low",
  }));
  const network = buildPedestrianNetwork(city),
    world = createNpcWorld("m3-8");
  resizeNpcPopulation(world, network, count);
  for (const [index, id] of world.ids.entries()) {
    world.poses.set(id, { x: 3.5 + index * 0.4, y: 0.02, z: 3.5, yaw: 0, speed: 0 });
    const behavior = world.behavior.get(id);
    if (behavior) behavior.wander = false;
  }
  return { city, network, world };
}

describe("TST-013 procedural NPC orchestration", () => {
  it("resolves bounded configuration and seeded component defaults", () => {
    expect(resolveNpcOrchestrationConfig()).toMatchObject({
      walkSpeed: 0.33,
      runSpeed: 0.75,
      runCrossings: true,
      greetingRadius: 0.9,
    });
    expect(
      resolveNpcOrchestrationConfig({
        walkSpeed: Number.NaN,
        runSpeed: -1,
        greetingCooldownMin: 20,
        greetingCooldownMax: 2,
        manualCrossingHeadingThreshold: 9,
      }),
    ).toMatchObject({
      walkSpeed: 0.33,
      runSpeed: 0.33,
      greetingCooldownMin: 20,
      greetingCooldownMax: 20,
      manualCrossingHeadingThreshold: 1,
    });
    const a = setup(2).world,
      b = setup(2).world;
    expect([...a.locomotion]).toEqual([...b.locomotion]);
    expect([...a.social]).toEqual([...b.social]);
  });

  it("moves, runs, stops, and releases a manually controlled NPC on valid space", () => {
    const { network, world } = setup();
    expect(takeNpcControl(world, "npc:0")).toBe(true);
    expect(setNpcControlInput(world, "npc:0", { direction: [1, 0], run: false })).toBe(true);
    for (let index = 0; index < 90; index++) tickNpcWorld(world, network, SIMULATION_STEP);
    expect(world.animation.get("npc:0")?.phase).toBe("walk");
    expect(setNpcControlInput(world, "npc:0", { direction: [1, 0], run: true })).toBe(true);
    for (let index = 0; index < 120; index++) tickNpcWorld(world, network, SIMULATION_STEP);
    const running = world.poses.get("npc:0");
    expect(running?.x).toBeGreaterThan(3.8);
    expect(running?.speed).toBeGreaterThan(0.5);
    expect(network.safe([running?.x ?? 0, running?.z ?? 0])).toBe(true);
    expect(world.animation.get("npc:0")?.phase).toBe("run");
    expect(stopNpc(world, "npc:0")).toBe(true);
    for (let index = 0; index < 90; index++) tickNpcWorld(world, network, SIMULATION_STEP);
    expect(world.poses.get("npc:0")?.speed).toBe(0);
    expect(world.animation.get("npc:0")?.phase).toBe("idle");
    expect(releaseNpcControl(world, "npc:0")).toBe(true);
    expect(world.control.get("npc:0")?.mode).toBe("autonomous");
  });

  it("emits deterministic autonomous and explicit greeting beats", () => {
    const first = setup(2),
      second = setup(2);
    for (const sample of [first, second]) {
      for (const social of sample.world.social.values()) social.nextGreetingTick = 0;
      tickNpcWorld(sample.world, sample.network, SIMULATION_STEP);
    }
    expect([...first.world.animation]).toEqual([...second.world.animation]);
    expect(first.world.animation.get("npc:0")).toMatchObject({
      phase: "greet",
      beat: "wave",
      attentionTargetId: "npc:1",
    });
    expect(greetNpc(first.world, "npc:0")).toBe(true);
    tickNpcWorld(first.world, first.network, SIMULATION_STEP);
    expect(first.world.animation.get("npc:0")?.sequence).toBe(2);
  });

  it("accepts only finite, visible, separated root motion without mutating the document", () => {
    const { city, network, world } = setup(2),
      before = JSON.stringify(city);
    expect(
      applyNpcMotionRequest(world, network, "npc:0", {
        translation: { x: -0.05, y: 0, z: 0 },
        yawDelta: 0.1,
        source: "turn",
      }),
    ).toBe(true);
    expect(
      applyNpcMotionRequest(world, network, "npc:0", {
        translation: { x: Number.NaN, y: 0, z: 0 },
        yawDelta: 0,
        source: "turn",
      }),
    ).toBe(false);
    expect(
      applyNpcMotionRequest(world, network, "npc:0", {
        translation: { x: 50, y: 0, z: 0 },
        yawDelta: 0,
        source: "sidestep",
      }),
    ).toBe(false);
    expect(JSON.stringify(city)).toBe(before);
  });

  it("rejects invalid control IDs and non-finite input without partial mutation", () => {
    const { world } = setup();
    const before = {
      ...world.control.get("npc:0"),
      direction: [...(world.control.get("npc:0")?.direction ?? [0, 0])],
    };
    expect(takeNpcControl(world, "missing")).toBe(false);
    expect(setNpcControlInput(world, "npc:0", { direction: [1, 0], run: true })).toBe(false);
    expect(world.control.get("npc:0")?.mode).toBe(before.mode);
    expect(world.control.get("npc:0")?.direction).toEqual(before.direction);
    expect(takeNpcControl(world, "npc:0")).toBe(true);
    expect(setNpcControlInput(world, "npc:0", { direction: [1, 0], run: false })).toBe(true);
    const held = [...(world.control.get("npc:0")?.direction ?? [0, 0])];
    expect(setNpcControlInput(world, "npc:0", { direction: [Number.NaN, 0], run: true })).toBe(
      false,
    );
    expect(world.control.get("npc:0")?.direction).toEqual(held);
    expect(world.control.get("npc:0")?.run).toBe(false);
    expect(greetNpc(world, "missing")).toBe(false);
    expect(stopNpc(world, "missing")).toBe(false);
    expect(releaseNpcControl(world, "missing")).toBe(false);
  });

  it("keeps greeting attention for the wave hold and lets manual greet raise the sequence", () => {
    const { world, network } = setup(2);
    for (const social of world.social.values()) social.nextGreetingTick = 0;
    tickNpcWorld(world, network, SIMULATION_STEP);
    expect(world.animation.get("npc:0")?.beat).toBe("wave");
    tickNpcWorld(world, network, SIMULATION_STEP);
    expect(world.animation.get("npc:0")).toMatchObject({
      phase: "greet",
      beat: null,
      attentionTargetId: "npc:1",
    });
    expect(greetNpc(world, "npc:0")).toBe(true);
    tickNpcWorld(world, network, SIMULATION_STEP);
    expect(world.animation.get("npc:0")?.sequence).toBeGreaterThanOrEqual(2);
  });

  it("runs an admitted crossing to completion and defers stop and release", () => {
    const city = createEmptyCityDocument({
      id: "m3-8-cross",
      name: "Crossing run",
      seed: "traffic",
      timestamp: "2026-09-08T00:00:00Z",
      parameters: PRESET_PARAMETERS.balanced,
    });
    city.map.boundaryMask.fill(true);
    for (let x = 1; x <= 8; x++)
      city.roadGraph.cells.push({
        id: `road:${x},4`,
        position: [x, 4],
        assetId: x === 4 ? "roads:road-crossroad-path" : "roads:road-straight",
        rotation: 0,
      });
    city.roadGraph.nodes = [
      { id: "gate:0", kind: "gate", position: [1, 4] },
      { id: "gate:1", kind: "gate", position: [8, 4] },
    ];
    city.roadGraph.topology = resolveRoadTopology(city, TEST_ASSETS);
    city.sidewalks = [
      { id: "s0", blockId: "b", position: [4, 3], rotation: 0, assetId: "roads:tile-low" },
      { id: "s1", blockId: "b", position: [4, 5], rotation: 0, assetId: "roads:tile-low" },
    ];
    const network = buildPedestrianNetwork(city),
      world = createNpcWorld("traffic");
    resizeNpcPopulation(world, network, 1);
    world.poses.set("npc:0", { x: 4.5, z: 3.5, y: 0.025, yaw: 0, speed: 0 });
    const behavior = world.behavior.get("npc:0");
    if (behavior) behavior.wander = false;
    issueNpcOrder(world, network, "npc:0", { kind: "moveTo", point: [4.5, 5.5] });
    let sawRun = false;
    for (let index = 0; index < 800; index++) {
      tickNpcWorld(world, network, SIMULATION_STEP);
      if (world.crossing.get("npc:0")?.active) {
        expect(world.animation.get("npc:0")?.phase).toBe("run");
        if ((world.poses.get("npc:0")?.speed ?? 0) > 0.3) {
          sawRun = true;
          break;
        }
      }
    }
    expect(sawRun).toBe(true);
    expect(takeNpcControl(world, "npc:0")).toBe(true);
    expect(stopNpc(world, "npc:0")).toBe(true);
    expect(world.crossing.get("npc:0")?.active).not.toBeNull();
    for (let index = 0; index < 1500; index++) tickNpcWorld(world, network, SIMULATION_STEP);
    expect(world.crossing.get("npc:0")?.active).toBeNull();
    expect(world.poses.get("npc:0")?.z).toBeGreaterThan(5);
    expect(world.poses.get("npc:0")?.speed).toBe(0);
    expect(world.control.get("npc:0")?.mode).toBe("manual");
    expect(releaseNpcControl(world, "npc:0")).toBe(true);
    expect(world.control.get("npc:0")?.mode).toBe("autonomous");
  });
});
