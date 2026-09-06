import { agentCountFor, DEFAULT_AGENT_SPEED } from "./agents.js";
import { required } from "./drive-contracts.js";
import { type DriveNetwork, findNetworkPath, sampleDriveSegment } from "./drive-network.js";
import { SeededRandom } from "./rng.js";
export const DEFAULT_VEHICLE_SPEED = DEFAULT_AGENT_SPEED * 2;
export const vehicleCountFor = agentCountFor;
export const VEHICLE_ASSET_IDS = [
  "cars:sedan",
  "cars:sedan-sports",
  "cars:hatchback-sports",
  "cars:suv",
  "cars:suv-luxury",
  "cars:taxi",
  "cars:van",
  "cars:police",
  "cars:ambulance",
  "cars:firetruck",
  "cars:garbage-truck",
] as const;
export type VehicleAssetId = (typeof VEHICLE_ASSET_IDS)[number];

export interface VehicleRuntimeState {
  id: string;
  index: number;
  assetId: VehicleAssetId;
  segmentId: string;
  distance: number;
  route: string[];
  destination: string;
  destinationCount: number;
  portalCount: number;
  speed: number;
}

function assignDestination(
  vehicle: VehicleRuntimeState,
  network: DriveNetwork,
  seed: string,
): void {
  const visited = new Set([vehicle.segmentId]),
    queue = [vehicle.segmentId];
  for (let i = 0; i < queue.length; i++)
    for (const id of network.byId.get(required(queue[i], "vehicle queue"))?.successors ?? [])
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(id);
      }
  const options = queue
    .filter(
      (id) =>
        id !== vehicle.segmentId &&
        (network.byId.get(id)?.kind === "lane" || network.exits.has(id)),
    )
    .sort();
  const rng = new SeededRandom(
    `${seed}:vehicle:${vehicle.index}:destination:${vehicle.destinationCount++}`,
  );
  const destination = options[rng.integer(0, Math.max(0, options.length - 1))];
  vehicle.destination = destination ?? vehicle.segmentId;
  vehicle.route = destination
    ? (findNetworkPath(network, vehicle.segmentId, destination)?.slice(1) ?? [])
    : [];
}

export function spawnVehicles(input: {
  seed: string;
  network: DriveNetwork;
  count: number;
}): VehicleRuntimeState[] {
  if (!input.network.validation.valid) return [];
  const free = input.network.segments
    .filter((s) => s.kind === "lane")
    .map((s) => s.id)
    .sort();
  const vehicles: VehicleRuntimeState[] = [];
  for (
    let index = 0;
    index < Math.min(Math.max(0, Math.floor(input.count)), free.length + vehicles.length);
    index++
  ) {
    const rng = new SeededRandom(`${input.seed}:vehicle:${index}`);
    const slot = rng.integer(0, free.length - 1),
      segmentId = required(free.splice(slot, 1)[0], "vehicle slot");
    const vehicle: VehicleRuntimeState = {
      id: `vehicle:${index}`,
      index,
      assetId: required(
        VEHICLE_ASSET_IDS[rng.integer(0, VEHICLE_ASSET_IDS.length - 1)],
        "vehicle asset",
      ),
      segmentId,
      distance: rng.float() * required(input.network.byId.get(segmentId), segmentId).length,
      route: [],
      destination: segmentId,
      destinationCount: 0,
      portalCount: 0,
      speed: 0,
    };
    assignDestination(vehicle, input.network, input.seed);
    vehicles.push(vehicle);
  }
  return vehicles;
}

/** SIM-014: pure distance-based movement; no frame travel is thrown away. */
export function tickVehicles(
  vehicles: readonly VehicleRuntimeState[],
  input: { network: DriveNetwork; seed: string; dt: number; speed?: number },
): VehicleRuntimeState[] {
  const speed = input.speed ?? DEFAULT_VEHICLE_SPEED;
  if (!Number.isFinite(input.dt) || input.dt < 0 || !Number.isFinite(speed) || speed < 0)
    throw new Error("Vehicle time and speed must be finite and nonnegative");
  return vehicles.map((current) => {
    const v = { ...current, route: [...current.route] };
    let remaining = input.dt * speed;
    v.speed = remaining > 0 ? speed : 0;
    while (remaining > 0) {
      const segment = input.network.byId.get(v.segmentId);
      if (!segment) {
        v.speed = 0;
        break;
      }
      const travel = Math.min(remaining, segment.length - v.distance);
      v.distance += travel;
      remaining -= travel;
      if (v.distance < segment.length - 1e-10) break;
      let next = v.route.shift();
      if (input.network.exits.has(segment.id)) {
        const oldPortal = input.network.topology.portals.find((p) =>
          p.portIds.includes(segment.to),
        );
        const entries = input.network.entrances.filter((id) => {
          const entry = input.network.byId.get(id);
          return entry ? !oldPortal?.portIds.includes(entry.from) : false;
        });
        const rng = new SeededRandom(`${input.seed}:vehicle:${v.index}:portal:${v.portalCount++}`);
        next = entries[rng.integer(0, Math.max(0, entries.length - 1))];
        v.route = [];
      } else if (!next) {
        assignDestination(v, input.network, input.seed);
        next = v.route.shift();
        if (!next) next = segment.successors[0];
      }
      if (!next) {
        v.speed = 0;
        break;
      }
      v.segmentId = next;
      v.distance = 0;
      if (!v.route.length) assignDestination(v, input.network, input.seed);
    }
    return v;
  });
}

export function vehicleWorldPose(vehicle: VehicleRuntimeState, network: DriveNetwork) {
  const segment = network.byId.get(vehicle.segmentId);
  if (!segment) throw new Error(`Unknown drive segment ${vehicle.segmentId}`);
  return { ...sampleDriveSegment(segment, vehicle.distance), y: 0.025, speed: vehicle.speed };
}
