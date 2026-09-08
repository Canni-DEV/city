import { describe, expect, it } from "vitest";
import {
  applyNpcMotionRequest,
  buildPedestrianNetwork,
  createEmptyCityDocument,
  createNpcWorld,
  greetNpc,
  type Point,
  PRESET_PARAMETERS,
  releaseNpcControl,
  resizeNpcPopulation,
  resolveNpcOrchestrationConfig,
  SIMULATION_STEP,
  setNpcControlInput,
  stopNpc,
  takeNpcControl,
  tickNpcWorld,
} from "../src/index.js";

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
});
