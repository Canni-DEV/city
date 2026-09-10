import {
  advanceSimulationClock,
  applyNpcMotionRequest,
  interpolateNpcPose,
  SIMULATION_STEP,
  tickNpcWorld,
  tickVehicles,
  vehicleWorldPose,
} from "@city/core";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { npcScenePose, npcSceneVelocity } from "./npc-visual";
import { resizeSimulation, type SimulationRuntime, snapshotNpcPoses } from "./simulation-runtime";

export function SimulationLayer({
  runtime,
  agents,
  vehicles,
}: {
  runtime: SimulationRuntime;
  agents: number;
  vehicles: number;
}) {
  const hidden = useRef(document.hidden),
    resumed = useRef(false);
  useEffect(() => {
    const visibility = () => {
      hidden.current = document.hidden;
      resumed.current = true;
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useFrame((_, delta) => {
    const tick = () => {
      resizeSimulation(runtime, agents, vehicles);
      for (const [id, request] of runtime.motionRequests) {
        applyNpcMotionRequest(runtime.world, runtime.network, id, request);
      }
      runtime.motionRequests.clear();
      snapshotNpcPoses(runtime);
      runtime.previousVehicles = runtime.vehicles.current;
      tickNpcWorld(
        runtime.world,
        runtime.network,
        SIMULATION_STEP,
        runtime.drive
          ? {
              network: runtime.drive,
              vehicles: runtime.vehicles.current,
              bodyRadii: runtime.bodyRadii,
            }
          : undefined,
      );
      if (runtime.drive)
        runtime.vehicles.current = tickVehicles(runtime.vehicles.current, {
          network: runtime.drive,
          seed: runtime.world.seed,
          dt: SIMULATION_STEP,
        });
      const mapSize = runtime.city.map.size;
      for (const [id, actor] of runtime.animationActors) {
        const pose = runtime.world.poses.get(id);
        if (!pose) continue;
        const before = runtime.previous.get(id) ?? pose;
        const directive = runtime.world.animation.get(id);
        const attentionPose = directive?.attentionTargetId
          ? runtime.world.poses.get(directive.attentionTargetId)
          : undefined;
        const sequence = directive?.sequence ?? 0;
        if (directive?.beat === "wave" && runtime.animationSequences.get(id) !== sequence) {
          actor.playBeat({ type: "wave" });
        }
        runtime.animationSequences.set(id, sequence);
        const scene = npcScenePose(pose, mapSize);
        const attention = attentionPose ? npcScenePose(attentionPose, mapSize) : undefined;
        actor.fixedUpdate(
          SIMULATION_STEP,
          {
            position: scene,
            facingYaw: pose.yaw,
            velocity: npcSceneVelocity(before, pose, SIMULATION_STEP),
            grounded: true,
          },
          attention
            ? {
                attention: {
                  target: {
                    x: attention.x,
                    y: attention.y + actor.animator.rig.height * 0.85,
                    z: attention.z,
                  },
                },
              }
            : {},
        );
        const request = actor.motionRequest;
        if (request) runtime.motionRequests.set(id, request);
      }
    };
    const stepping = runtime.steps > 0 && !hidden.current;
    if (stepping) runtime.steps--;
    const skip = hidden.current || resumed.current;
    const count = advanceSimulationClock(
      runtime.clock,
      skip ? 0 : delta,
      tick,
      runtime.paused || skip,
      stepping,
    );
    resumed.current = false;
    runtime.animationDelta = count * SIMULATION_STEP;
    const alpha =
      stepping || runtime.paused ? 1 : Math.min(1, runtime.clock.accumulator / SIMULATION_STEP);
    runtime.animationAlpha = alpha;
    for (const [id, pose] of runtime.world.poses)
      runtime.display.set(id, interpolateNpcPose(runtime.previous.get(id) ?? pose, pose, alpha));
    if (runtime.drive) {
      const previous = new Map(runtime.previousVehicles.map((v) => [v.id, v]));
      for (const v of runtime.vehicles.current) {
        const currentPose = vehicleWorldPose(v, runtime.drive),
          old = previous.get(v.id);
        const before =
          old && old.portalCount === v.portalCount
            ? vehicleWorldPose(old, runtime.drive)
            : currentPose;
        runtime.vehicleDisplay.set(v.id, interpolateNpcPose(before, currentPose, alpha));
      }
    }
    // Resuming at a high display refresh rate must not interpolate backwards.
    if (runtime.paused) {
      snapshotNpcPoses(runtime);
      runtime.previousVehicles = runtime.vehicles.current;
    }
  }, -2);
  return null;
}
