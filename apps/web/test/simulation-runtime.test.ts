import { createEmptyCityDocument, type Point, PRESET_PARAMETERS } from "@city/core";
import { expect, it } from "vitest";
import {
  createSimulationRuntime,
  resizeSimulation,
  snapshotNpcPoses,
} from "../src/city/simulation-runtime";

it("TST-013 runtime snapshots reuse isolated poses and prune removed population", () => {
  const city = createEmptyCityDocument({
    id: "lifetime",
    name: "Lifetime",
    seed: "lifetime",
    timestamp: "2026-09-10T00:00:00Z",
    parameters: PRESET_PARAMETERS.balanced,
  });
  city.map.boundaryMask.fill(true);
  city.sidewalks = Array.from({ length: 10 }, (_, i) => ({
    id: `sidewalk:${i}`,
    blockId: "block",
    position: [i + 2, 3] as Point,
    rotation: 0,
    assetId: "roads:tile-low",
  }));
  const runtime = createSimulationRuntime(city, null);
  resizeSimulation(runtime, 2, 0);
  snapshotNpcPoses(runtime);
  const id = runtime.world.ids[0];
  if (!id) throw new Error("Expected spawned NPC");
  const pose = runtime.world.poses.get(id);
  const snapshot = runtime.previous.get(id);
  if (!pose || !snapshot) throw new Error("Expected NPC snapshots");
  const map = runtime.previous;
  expect(snapshot).not.toBe(pose);
  const originalX = snapshot.x;
  pose.x += 0.1;
  expect(snapshot.x).toBe(originalX);
  for (let tick = 0; tick < 10000; tick++) snapshotNpcPoses(runtime);
  expect(runtime.previous).toBe(map);
  expect(runtime.previous.get(id)).toBe(snapshot);
  expect(snapshot.x).toBe(pose.x);
  runtime.vehicleCount = 2;
  runtime.vehicleDisplay.set("removed-vehicle", { ...pose });
  resizeSimulation(runtime, 0, 0);
  expect(runtime.previous.size).toBe(0);
  expect(runtime.vehicleDisplay.size).toBe(0);
  expect(runtime.world.ids).toHaveLength(0);
});
