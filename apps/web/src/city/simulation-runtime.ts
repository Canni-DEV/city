import { assetCatalog } from "@city/assets";
import {
  associatePedestrianTraffic,
  buildPedestrianNetwork,
  type CityDocumentV1,
  createNpcWorld,
  type DriveNetwork,
  type NpcPose,
  resizeNpcPopulation,
  spawnVehicles,
  type VehicleRuntimeState,
} from "@city/core";

export function createSimulationRuntime(city: CityDocumentV1, drive: DriveNetwork | null) {
  const network = buildPedestrianNetwork(city),
    world = createNpcWorld(city.generator.seed);
  const bodyRadii = new Map(
    assetCatalog.entries
      .filter((e) => e.vehicleBounds)
      .map((e) => {
        const b = e.vehicleBounds;
        return [
          e.id,
          b
            ? Math.hypot(
                Math.max(Math.abs(b.min[0]), Math.abs(b.max[0])),
                Math.max(Math.abs(b.min[1]), Math.abs(b.max[1])),
              ) * (e.uniformScale ?? 1)
            : 0.5,
        ];
      }),
  );
  if (drive) associatePedestrianTraffic(network, drive, Math.max(0.5, ...bodyRadii.values()));
  return {
    city,
    drive,
    network,
    world,
    bodyRadii,
    clock: { accumulator: 0, ticks: 0 },
    paused: false,
    steps: 0,
    animationDelta: 0,
    previous: new Map<string, NpcPose>(),
    display: new Map<string, NpcPose>(),
    vehicles: { current: [] as VehicleRuntimeState[] },
    previousVehicles: [] as VehicleRuntimeState[],
    vehicleDisplay: new Map<string, NpcPose>(),
    agentCount: -1,
    vehicleCount: -1,
  };
}
export type SimulationRuntime = ReturnType<typeof createSimulationRuntime>;
export function resizeSimulation(runtime: SimulationRuntime, agents: number, vehicles: number) {
  const crossingOccupied = [...runtime.world.crossing.values()].some((c) => c.active);
  // A newly spawned NPC must not occupy a reserved crossing exit either.
  if (agents !== runtime.agentCount && !(agents > runtime.agentCount && crossingOccupied)) {
    resizeNpcPopulation(runtime.world, runtime.network, agents);
    runtime.agentCount = agents;
  }
  // Do not introduce unpredicted traffic while a pedestrian owns a crossing.
  const admittingMoreTraffic = vehicles > runtime.vehicleCount;
  if (vehicles !== runtime.vehicleCount && !(admittingMoreTraffic && crossingOccupied)) {
    const spawned = runtime.drive
      ? spawnVehicles({ seed: runtime.world.seed, network: runtime.drive, count: vehicles })
      : [];
    const existing = new Map(runtime.vehicles.current.map((v) => [v.id, v]));
    runtime.vehicles.current = spawned.map((v) => existing.get(v.id) ?? v);
    runtime.vehicleCount = vehicles;
  }
}
