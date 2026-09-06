import {
  advanceSimulationClock,
  interpolateNpcPose,
  SIMULATION_STEP,
  tickNpcWorld,
  tickVehicles,
  vehicleWorldPose,
} from "@city/core";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { resizeSimulation, type SimulationRuntime } from "./simulation-runtime";

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
      runtime.previous = new Map(runtime.world.poses);
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
      runtime.previous = new Map(runtime.world.poses);
      runtime.previousVehicles = runtime.vehicles.current;
    }
  }, -2);
  return null;
}
