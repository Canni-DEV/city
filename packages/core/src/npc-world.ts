import { AGENT_SKINS, type AgentSkin } from "./agents.js";
import type { DriveNetwork } from "./drive-network.js";
import { createPathCurve } from "./path-geometry.js";
import {
  distance2,
  findPedestrianRoute,
  NPC_RADIUS,
  nearestPedestrianNode,
  type PedestrianEdge,
  type PedestrianNetwork,
} from "./pedestrian-network.js";
import { SeededRandom } from "./rng.js";
import type { Point } from "./road-tiles.js";
import {
  DEFAULT_VEHICLE_SPEED,
  tickVehicles,
  type VehicleRuntimeState,
  vehicleWorldPose,
} from "./vehicles.js";

export const NPC_SPEED = 0.33;
export const SIMULATION_STEP = 1 / 60;
export type NpcOrder = { kind: "moveTo"; point: Point } | { kind: "wait"; seconds: number };
export type NpcOrderStatus = "pending" | "active" | "completed" | "cancelled" | "failed";
export interface NpcPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
}
export interface NpcNavigation {
  legs: NpcLeg[];
  leg: number;
  cursor: number;
  destination: Point | null;
  penalized: Set<string>;
}
export interface NpcLeg {
  points: Point[];
  crossingId: string | null;
  length: number;
}
export interface NpcBehavior {
  order: NpcOrder | null;
  status: NpcOrderStatus;
  reason: string;
  remaining: number;
  sequence: number;
  wander: boolean;
}
export interface NpcCrossing {
  active: string | null;
  waiting: number;
  retry: number;
}
export interface NpcWorld {
  seed: string;
  ids: string[];
  nextId: number;
  tick: number;
  poses: Map<string, NpcPose>;
  locomotion: Map<string, { speed: number; radius: number }>;
  navigation: Map<string, NpcNavigation>;
  behavior: Map<string, NpcBehavior>;
  crossing: Map<string, NpcCrossing>;
  appearance: Map<string, { skin: AgentSkin }>;
}
export interface NpcDiagnostic {
  id: string;
  pose: NpcPose;
  radius: number;
  order: NpcOrder | null;
  status: NpcOrderStatus;
  reason: string;
  destination: Point | null;
  route: Point[];
  neighbors: string[];
  crossing: string | null;
}
export function createNpcWorld(seed: string): NpcWorld {
  return {
    seed,
    ids: [],
    nextId: 0,
    tick: 0,
    poses: new Map(),
    locomotion: new Map(),
    navigation: new Map(),
    behavior: new Map(),
    crossing: new Map(),
    appearance: new Map(),
  };
}
const pointOf = (p: NpcPose): Point => [p.x, p.z];
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const lengthOf = (points: Point[]) =>
  points.slice(1).reduce((n, p, i) => n + distance2(points[i] as Point, p), 0);
const mix = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/** Population changes preserve all surviving component values and identities. */
export function resizeNpcPopulation(
  world: NpcWorld,
  network: PedestrianNetwork,
  count: number,
): void {
  const wanted = Math.max(0, Math.min(64, Math.floor(Number.isFinite(count) ? count : 0)));
  while (world.ids.length > wanted) {
    const id = world.ids.pop();
    if (!id) break;
    for (const map of [
      world.poses,
      world.locomotion,
      world.navigation,
      world.behavior,
      world.crossing,
      world.appearance,
    ])
      map.delete(id);
  }
  const nodes = [...network.nodes.values()].filter((n) => n.kind === "sidewalk");
  while (world.ids.length < wanted && nodes.length) {
    const id = `npc:${world.nextId}`,
      rng = new SeededRandom(`${world.seed}:${id}`);
    const start = rng.integer(0, nodes.length - 1);
    let selected: (typeof nodes)[number] | undefined;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[(start + i) % nodes.length];
      if (
        n &&
        [...world.poses.values()].every(
          (p) => distance2(pointOf(p), n.point) >= NPC_RADIUS * 2 + 0.05,
        )
      ) {
        selected = n;
        break;
      }
    }
    if (!selected) break;
    world.nextId++;
    world.ids.push(id);
    world.poses.set(id, {
      x: selected.point[0],
      z: selected.point[1],
      y: network.height(selected.point),
      yaw: 0,
      speed: 0,
    });
    world.locomotion.set(id, { speed: NPC_SPEED * (0.9 + rng.float() * 0.2), radius: NPC_RADIUS });
    world.navigation.set(id, {
      legs: [],
      leg: 0,
      cursor: 0,
      destination: null,
      penalized: new Set(),
    });
    world.behavior.set(id, {
      order: null,
      status: "completed",
      reason: "Arrived",
      remaining: 0,
      sequence: 0,
      wander: true,
    });
    world.crossing.set(id, { active: null, waiting: 0, retry: 0 });
    world.appearance.set(id, { skin: AGENT_SKINS[rng.integer(0, 3)] ?? AGENT_SKINS[0] });
  }
}

function smoothPoints(network: PedestrianNetwork, source: Point[], crossing: boolean): Point[] {
  const points = source.filter((p, i) => i === 0 || distance2(p, source[i - 1] as Point) > 1e-6);
  if (points.length < 2) return points;
  // Simplify park micro-grid paths, preserving crossing shape and sidewalk right preference.
  const simple: Point[] = [points[0] as Point];
  for (let i = 1; i < points.length; i++) {
    if (
      !crossing &&
      network.parks.has(`${Math.floor(points[i]?.[0] ?? 0)},${Math.floor(points[i]?.[1] ?? 0)}`)
    ) {
      while (
        i + 1 < points.length &&
        network.visible(simple[simple.length - 1] as Point, points[i + 1] as Point) &&
        network.parks.has(
          `${Math.floor(points[i + 1]?.[0] ?? 0)},${Math.floor(points[i + 1]?.[1] ?? 0)}`,
        )
      )
        i++;
    }
    simple.push(points[i] as Point);
  }
  const offset = simple.map((p, i): Point => {
    if (
      i === 0 ||
      i === simple.length - 1 ||
      crossing ||
      !network.sidewalks.has(`${Math.floor(p[0])},${Math.floor(p[1])}`)
    )
      return p;
    const a = simple[i - 1] as Point,
      b = simple[i + 1] as Point,
      d = distance2(a, b);
    const shifted: Point = [
      p[0] - ((b[1] - a[1]) / Math.max(d, 1e-9)) * 0.16,
      p[1] + ((b[0] - a[0]) / Math.max(d, 1e-9)) * 0.16,
    ];
    return network.safe(shifted) ? shifted : p;
  });
  const result: Point[] = [offset[0] as Point];
  for (let i = 1; i < offset.length - 1; i++) {
    const a = offset[i - 1] as Point,
      b = offset[i] as Point,
      c = offset[i + 1] as Point;
    const trim = Math.min(0.25, distance2(a, b) * 0.35, distance2(b, c) * 0.35);
    const entry = mix(b, a, trim / Math.max(distance2(a, b), 1e-9)),
      exit = mix(b, c, trim / Math.max(distance2(b, c), 1e-9));
    const curve = createPathCurve([entry, mix(entry, b, 0.67), mix(exit, b, 0.67), exit]);
    const samples = curve.samples.map((s) => s.point);
    if (
      network.visible(result[result.length - 1] as Point, entry, crossing) &&
      samples.slice(1).every((p, j) => network.visible(samples[j] as Point, p, crossing))
    )
      result.push(...samples);
    else result.push(simple[i] as Point);
  }
  result.push(offset[offset.length - 1] as Point);
  return result.slice(1).every((p, i) => network.visible(result[i] as Point, p, crossing))
    ? result
    : points;
}

function makeLegs(
  network: PedestrianNetwork,
  from: Point,
  goal: Point,
  edges: PedestrianEdge[],
): NpcLeg[] {
  const legs: NpcLeg[] = [],
    ordinary: Point[] = [from];
  const flush = () => {
    if (ordinary.length > 1) {
      const points = smoothPoints(network, ordinary, false);
      legs.push({ points, crossingId: null, length: lengthOf(points) });
    }
    ordinary.length = 0;
  };
  for (const edge of edges) {
    if (edge.crossing) {
      ordinary.push(edge.points[0] as Point);
      flush();
      const points = smoothPoints(network, edge.points, true);
      legs.push({ points, crossingId: edge.id, length: lengthOf(points) });
      ordinary.push(edge.points[edge.points.length - 1] as Point);
    } else ordinary.push(...edge.points);
  }
  ordinary.push(goal);
  flush();
  return legs.filter((l) => l.length > 1e-6);
}

/** SIM-024: orders are runtime intent, not document/editor commands. */
export function issueNpcOrder(
  world: NpcWorld,
  network: PedestrianNetwork,
  id: string,
  order: NpcOrder,
  wander = false,
): NpcOrderStatus {
  const behavior = world.behavior.get(id),
    nav = world.navigation.get(id),
    pose = world.poses.get(id),
    crossing = world.crossing.get(id);
  if (!behavior || !nav || !pose || !crossing) return "failed";
  behavior.order = structuredClone(order);
  behavior.status = "pending";
  behavior.wander = wander;
  // Never interrupt an admitted crossing. Consume the pending order on its exit.
  if (crossing.active) {
    behavior.reason = "Finishing crossing";
    return "pending";
  }
  nav.legs = [];
  nav.leg = 0;
  nav.cursor = 0;
  crossing.waiting = 0;
  crossing.retry = 0;
  if (order.kind === "wait") {
    nav.destination = null;
    if (!Number.isFinite(order.seconds) || order.seconds < 0) {
      behavior.status = "failed";
      behavior.reason = "Invalid wait duration";
      return "failed";
    }
    behavior.remaining = order.seconds;
    behavior.status = "active";
    behavior.reason = "Waiting";
    return "active";
  }
  nav.destination = [...order.point];
  if (!network.safe(order.point)) {
    behavior.status = "failed";
    behavior.reason = "Destination is not walkable";
    return "failed";
  }
  const start = nearestPedestrianNode(network, pointOf(pose)),
    goal = start ? nearestPedestrianNode(network, order.point, start.component) : undefined;
  const edges =
    start && goal ? findPedestrianRoute(network, start.id, goal.id, nav.penalized) : undefined;
  if (!edges || !goal) {
    behavior.status = "failed";
    behavior.reason = "Destination is unreachable";
    return "failed";
  }
  nav.legs = makeLegs(network, pointOf(pose), order.point, edges);
  behavior.status = "active";
  behavior.reason = "Walking";
  return "active";
}
export function cancelNpcOrder(world: NpcWorld, id: string): void {
  const b = world.behavior.get(id);
  if (!b) return;
  b.status = "cancelled";
  b.wander = false;
  b.reason = "Cancelled";
  // An admitted crossing must finish before stopping.
  if (!world.crossing.get(id)?.active) {
    const n = world.navigation.get(id);
    if (n) n.legs = [];
  }
}

export interface NpcTraffic {
  network: DriveNetwork;
  vehicles: readonly VehicleRuntimeState[];
  bodyRadii: ReadonlyMap<string, number>;
}
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / Math.max(1e-12, dx * dx + dz * dz)),
  );
  return distance2(p, [a[0] + dx * t, a[1] + dz * t]);
}
const nearLeg = (point: Point, leg: NpcLeg, radius: number) =>
  leg.points.slice(1).some((p, i) => segmentDistance(point, leg.points[i] as Point, p) < radius);

/** Conservative swept circular body envelopes include offset pivots and portal predictions. */
export function canEnterNpcCrossing(
  world: NpcWorld,
  id: string,
  leg: NpcLeg,
  traffic?: NpcTraffic,
): boolean {
  const end = leg.points[leg.points.length - 1];
  if (!end) return false;
  for (const other of world.ids) {
    if (other === id) continue;
    const pose = world.poses.get(other),
      state = world.crossing.get(other),
      nav = world.navigation.get(other);
    if (
      pose &&
      (distance2(pointOf(pose), end) < NPC_RADIUS * 3 ||
        nearLeg(pointOf(pose), leg, NPC_RADIUS * 2 + 0.05))
    )
      return false;
    const active = nav?.legs[nav.leg];
    if (state?.active && active?.points.some((p) => nearLeg(p, leg, NPC_RADIUS * 2 + 0.05)))
      return false;
  }
  if (!traffic?.vehicles.length) return true;
  const speed = world.locomotion.get(id)?.speed ?? NPC_SPEED;
  const horizon = leg.length / speed + speed / 0.8 + 6 + 1;
  let predicted = traffic.vehicles;
  const step = 0.1;
  for (let t = 0; t <= horizon + step; t += step) {
    for (const vehicle of predicted) {
      const pose = vehicleWorldPose(vehicle, traffic.network);
      const radius =
        (traffic.bodyRadii.get(vehicle.assetId) ?? 0.5) + NPC_RADIUS + DEFAULT_VEHICLE_SPEED * step;
      if (nearLeg([pose.x, pose.z], leg, radius)) return false;
    }
    predicted = tickVehicles(predicted, { network: traffic.network, seed: world.seed, dt: step });
  }
  return true;
}

function wander(world: NpcWorld, network: PedestrianNetwork, id: string): void {
  const b = world.behavior.get(id),
    pose = world.poses.get(id);
  if (!b || !pose) return;
  const rng = new SeededRandom(`${world.seed}:${id}:order:${b.sequence++}`);
  if (b.order?.kind === "moveTo" && b.status === "completed") {
    issueNpcOrder(world, network, id, { kind: "wait", seconds: 1 + rng.float() * 2 }, true);
    return;
  }
  const start = nearestPedestrianNode(network, pointOf(pose));
  const options = [...network.nodes.values()].filter(
    (n) => n.component === start?.component && distance2(n.point, pointOf(pose)) > 0.5,
  );
  const destination = options[rng.integer(0, Math.max(0, options.length - 1))];
  if (destination)
    issueNpcOrder(world, network, id, { kind: "moveTo", point: destination.point }, true);
  else {
    b.reason = "No reachable destination";
    b.wander = false;
  }
}

/** SIM-021/022: all proposals read the same snapshot; sweep validation precedes integration. */
export function tickNpcWorld(
  world: NpcWorld,
  network: PedestrianNetwork,
  dt: number,
  traffic?: NpcTraffic,
): void {
  if (!Number.isFinite(dt) || dt < 0 || dt > SIMULATION_STEP + 1e-9)
    throw new Error("NPC systems require a finite fixed step");
  if (dt === 0) return;
  const old = new Map(world.poses),
    proposed = new Map<string, NpcPose>();
  const spatial = new Map<string, string[]>();
  for (const [id, p] of old) {
    const k = `${Math.floor(p.x)},${Math.floor(p.z)}`,
      list = spatial.get(k) ?? [];
    list.push(id);
    spatial.set(k, list);
  }
  const neighbors = (p: NpcPose) => {
    const ids: string[] = [];
    for (let x = Math.floor(p.x) - 1; x <= Math.floor(p.x) + 1; x++)
      for (let z = Math.floor(p.z) - 1; z <= Math.floor(p.z) + 1; z++)
        ids.push(...(spatial.get(`${x},${z}`) ?? []));
    return ids;
  };
  for (const id of world.ids) {
    const pose = old.get(id),
      b = world.behavior.get(id),
      nav = world.navigation.get(id),
      cross = world.crossing.get(id),
      body = world.locomotion.get(id);
    if (!pose || !b || !nav || !cross || !body) continue;
    if (b.wander && ["completed", "failed"].includes(b.status)) wander(world, network, id);
    if (b.status === "pending" && b.order && !cross.active)
      issueNpcOrder(world, network, id, b.order, b.wander);
    let target: Point | undefined,
      leg = nav.legs[nav.leg];
    if (b.order?.kind === "wait" && b.status === "active" && !cross.active) {
      b.remaining = Math.max(0, b.remaining - dt);
      if (b.remaining <= 1e-9) {
        b.status = "completed";
        b.reason = "Wait completed";
      }
    } else if ((b.status === "active" || cross.active) && leg) {
      const end = leg.points[leg.points.length - 1] as Point;
      if (distance2(pointOf(pose), end) < 0.0067) {
        nav.leg++;
        nav.cursor = 0;
        cross.active = null;
        cross.waiting = 0;
        leg = nav.legs[nav.leg];
        if (!leg) {
          if (b.status === "active") {
            b.status = "completed";
            b.reason = "Arrived";
          }
          nav.penalized.clear();
        }
      }
      if (leg && (cross.active || (b.status !== "pending" && b.status !== "cancelled"))) {
        let admitted = true;
        if (leg.crossingId && !cross.active) {
          cross.retry -= dt;
          admitted = cross.retry <= 0 && canEnterNpcCrossing(world, id, leg, traffic);
          if (admitted) {
            cross.active = leg.crossingId;
            cross.waiting = 0;
          } else {
            cross.waiting += dt;
            b.reason = "Waiting for a safe crossing and clear exit";
            if (cross.retry <= 0) cross.retry = 0.5;
            if (cross.waiting >= 10 && nav.destination) {
              nav.penalized.add(leg.crossingId);
              issueNpcOrder(
                world,
                network,
                id,
                { kind: "moveTo", point: nav.destination },
                b.wander,
              );
            }
          }
        }
        if (admitted) {
          while (
            nav.cursor < leg.points.length - 1 &&
            distance2(pointOf(pose), leg.points[nav.cursor] as Point) < 0.12
          )
            nav.cursor++;
          target = leg.points[nav.cursor];
          b.reason = cross.active ? "Crossing" : "Walking";
        }
      } else if (leg && cross.active)
        target = leg.points[Math.min(nav.cursor, leg.points.length - 1)];
    } else if (b.status === "active" && b.order?.kind === "moveTo") {
      b.status = "completed";
      b.reason = "Arrived";
    }
    if (!target) {
      const speed = Math.max(0, pose.speed - 0.8 * dt);
      const next: Point = [
        pose.x + Math.sin(pose.yaw) * speed * dt,
        pose.z + Math.cos(pose.yaw) * speed * dt,
      ];
      const reserved = world.ids.some((other) => {
        if (other === id || !world.crossing.get(other)?.active) return false;
        const n = world.navigation.get(other),
          l = n?.legs[n.leg];
        return l ? nearLeg(next, l, NPC_RADIUS * 2 + 0.04) : false;
      });
      proposed.set(
        id,
        !reserved && network.visible(pointOf(pose), next)
          ? { ...pose, x: next[0], z: next[1], y: network.height(next), speed }
          : { ...pose, speed: 0 },
      );
      continue;
    }
    const dx = target[0] - pose.x,
      dz = target[1] - pose.z,
      remaining = distance2(pointOf(pose), target);
    const nearby = neighbors(pose).filter((other) => other !== id);
    let desired = Math.atan2(dx, dz);
    // Start a bounded right-side deviation before the stopping envelope is reached.
    if (
      !cross.active &&
      nearby.some((other) => {
        const p = old.get(other);
        if (!p) return false;
        const rx = p.x - pose.x,
          rz = p.z - pose.z;
        const along = (rx * dx + rz * dz) / Math.max(remaining, 1e-9);
        const lateral = Math.abs(rx * dz - rz * dx) / Math.max(remaining, 1e-9);
        return along > 0 && along < 0.9 && lateral < NPC_RADIUS * 2 + 0.04;
      })
    )
      desired = Math.atan2(
        dx - (dz / Math.max(remaining, 1e-9)) * 0.3,
        dz + (dx / Math.max(remaining, 1e-9)) * 0.3,
      );
    const turn = wrap(desired - pose.yaw);
    const yaw = pose.yaw + Math.max(-Math.PI * dt, Math.min(Math.PI * dt, turn));
    const goalDistance = leg
      ? distance2(pointOf(pose), leg.points[leg.points.length - 1] as Point)
      : remaining;
    const desiredSpeed = Math.abs(turn) > 0.9 ? 0 : Math.min(body.speed, goalDistance * 2);
    const speed = Math.max(
      0,
      Math.min(pose.speed + 0.8 * dt, Math.max(pose.speed - 0.8 * dt, desiredSpeed)),
    );
    let accepted: NpcPose | undefined;
    for (const angle of cross.active ? [0] : [0, -0.3, 0.3, -0.6, 0.6]) {
      const heading =
          pose.yaw +
          Math.max(-Math.PI * dt, Math.min(Math.PI * dt, wrap(desired + angle - pose.yaw))),
        vx = Math.sin(heading) * speed,
        vz = Math.cos(heading) * speed;
      const next: Point = [pose.x + vx * dt, pose.z + vz * dt];
      if (!network.visible(pointOf(pose), next, !!cross.active)) continue;
      if (cross.active && leg && !nearLeg(next, leg, 0.16)) continue;
      let blocked = false;
      for (const other of nearby) {
        const op = old.get(other);
        if (!op) continue;
        const relative: Point = [pose.x - op.x, pose.z - op.z];
        const future: Point = [
          relative[0] + (vx - Math.sin(op.yaw) * op.speed) * 0.5,
          relative[1] + (vz - Math.cos(op.yaw) * op.speed) * 0.5,
        ];
        if (segmentDistance([0, 0], relative, future) < body.radius * 2 + 0.015) {
          blocked = true;
          break;
        }
        const oc = world.crossing.get(other),
          on = world.navigation.get(other),
          reservedLeg = on?.legs[on.leg];
        if (
          !cross.active &&
          oc?.active &&
          reservedLeg &&
          nearLeg(next, reservedLeg, NPC_RADIUS * 2 + 0.04)
        ) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        accepted = { x: next[0], z: next[1], y: network.height(next), yaw: heading, speed };
        break;
      }
    }
    proposed.set(id, accepted ?? { ...pose, yaw, speed: 0 });
    if (!accepted) b.reason = "Yielding to another pedestrian or boundary";
  }
  // Reject both colliding proposals, then recheck against stopped agents until stable.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of world.ids) {
      const a = old.get(id),
        ap = proposed.get(id);
      if (!a || !ap) continue;
      for (const other of neighbors(a)) {
        if (other <= id) continue;
        const b = old.get(other),
          bp = proposed.get(other);
        if (!b || !bp) continue;
        if (
          segmentDistance([0, 0], [a.x - b.x, a.z - b.z], [ap.x - bp.x, ap.z - bp.z]) >=
          NPC_RADIUS * 2 - 1e-8
        )
          continue;
        for (const who of [id, other]) {
          const before = old.get(who),
            after = proposed.get(who);
          if (before && after && distance2(pointOf(before), pointOf(after)) > 0) {
            proposed.set(who, { ...before, speed: 0 });
            changed = true;
          }
        }
      }
    }
  }
  world.poses = proposed;
  world.tick++;
}

export function npcDiagnostics(world: NpcWorld, selected?: string): NpcDiagnostic[] {
  return (selected ? world.ids.filter((id) => id === selected) : world.ids).flatMap((id) => {
    const pose = world.poses.get(id),
      b = world.behavior.get(id),
      nav = world.navigation.get(id);
    if (!pose || !b || !nav) return [];
    return [
      {
        id,
        pose: { ...pose },
        radius: NPC_RADIUS,
        order: b.order,
        status: b.status,
        reason: b.reason,
        destination: nav.destination,
        route: nav.legs.slice(nav.leg).flatMap((l) => l.points),
        neighbors: world.ids.filter(
          (other) =>
            other !== id &&
            distance2(pointOf(world.poses.get(other) as NpcPose), pointOf(pose)) < 1,
        ),
        crossing: world.crossing.get(id)?.active ?? null,
      },
    ];
  });
}

export interface SimulationClock {
  accumulator: number;
  ticks: number;
}
export function advanceSimulationClock(
  clock: SimulationClock,
  delta: number,
  tick: () => void,
  paused = false,
  singleStep = false,
): number {
  if (!Number.isFinite(delta) || delta < 0)
    throw new Error("Simulation delta must be finite and nonnegative");
  if (singleStep) {
    tick();
    clock.ticks++;
    return 1;
  }
  if (paused) return 0;
  clock.accumulator += delta;
  let count = 0;
  while (clock.accumulator + 1e-10 >= SIMULATION_STEP && count < 8) {
    tick();
    clock.ticks++;
    clock.accumulator = Math.max(0, clock.accumulator - SIMULATION_STEP);
    count++;
  }
  return count;
}
export function interpolateNpcPose(a: NpcPose, b: NpcPose, alpha: number): NpcPose {
  const t = Math.max(0, Math.min(1, alpha));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: a.yaw + wrap(b.yaw - a.yaw) * t,
    speed: a.speed + (b.speed - a.speed) * t,
  };
}
