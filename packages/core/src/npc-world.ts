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
  type PedestrianNode,
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
export const NPC_RUN_SPEED = 0.75;
export const SIMULATION_STEP = 1 / 60;
export const NPC_GREET_HOLD = 2.4;
export const YIELD_REPATH_SECONDS = 1.5;
export const YIELD_NEW_DESTINATION_SECONDS = 3;
export const NPC_SIDESTEP = 0.1;
export const NPC_GOAL_ARRIVAL = 0.025;
export const NPC_LEG_ARRIVAL = 0.32;
export const NPC_TURN_CREEP = 0.12;
export const CROSSING_APPROACH_IGNORE = 0.55;
export const CROSSING_FOLLOW_GAP = 0.75;
export const CROSSING_QUEUE_BASE = 0.4;
export const CROSSING_QUEUE_SPACING = 0.26;
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
  yieldSeconds: number;
}
export interface NpcCrossing {
  active: string | null;
  waiting: number;
  retry: number;
}
export interface NpcControlState {
  mode: "autonomous" | "manual";
  direction: Point;
  run: boolean;
  stopRequested: boolean;
  greetSequence: number;
}
export type NpcAnimationPhase = "idle" | "walk" | "run" | "greet";
export interface NpcAnimationDirective {
  phase: NpcAnimationPhase;
  sequence: number;
  attentionTargetId: string | null;
  beat: "wave" | null;
}
export interface NpcOrchestrationConfig {
  walkSpeed: number;
  runSpeed: number;
  runCrossings: boolean;
  greetingRadius: number;
  greetingCooldownMin: number;
  greetingCooldownMax: number;
  manualCrossingHeadingThreshold: number;
}
export const DEFAULT_NPC_ORCHESTRATION: Readonly<NpcOrchestrationConfig> = {
  walkSpeed: NPC_SPEED,
  runSpeed: NPC_RUN_SPEED,
  runCrossings: true,
  greetingRadius: 0.9,
  greetingCooldownMin: 8,
  greetingCooldownMax: 18,
  manualCrossingHeadingThreshold: 0.5,
};
export interface NpcSocialState {
  nextGreetingTick: number;
  greetUntilTick: number;
}
export interface NpcMotionRequest {
  translation: { x: number; y: number; z: number };
  yawDelta: number;
  source: "turn" | "stagger" | "sidestep";
}
export interface NpcWorld {
  seed: string;
  ids: string[];
  nextId: number;
  tick: number;
  poses: Map<string, NpcPose>;
  locomotion: Map<string, { speed: number; runSpeed: number; radius: number }>;
  navigation: Map<string, NpcNavigation>;
  behavior: Map<string, NpcBehavior>;
  crossing: Map<string, NpcCrossing>;
  appearance: Map<string, { skin: AgentSkin }>;
  control: Map<string, NpcControlState>;
  animation: Map<string, NpcAnimationDirective>;
  social: Map<string, NpcSocialState>;
  orchestration: NpcOrchestrationConfig;
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
  controlMode: NpcControlState["mode"];
  animationPhase: NpcAnimationPhase;
  attentionTargetId: string | null;
  crossingRun: boolean;
  stopRequested: boolean;
}
export function resolveNpcOrchestrationConfig(
  input: Partial<NpcOrchestrationConfig> = {},
): NpcOrchestrationConfig {
  const finite = (value: number | undefined, fallback: number, min: number, max: number) =>
    value === undefined || !Number.isFinite(value) ? fallback : Math.max(min, Math.min(max, value));
  const walkSpeed = finite(input.walkSpeed, NPC_SPEED, 0.05, 2);
  const runSpeed = finite(input.runSpeed, NPC_RUN_SPEED, walkSpeed, 4);
  const greetingCooldownMin = finite(input.greetingCooldownMin, 8, 0.5, 120);
  return {
    walkSpeed,
    runSpeed,
    runCrossings: input.runCrossings ?? true,
    greetingRadius: finite(input.greetingRadius, 0.9, NPC_RADIUS * 2, 4),
    greetingCooldownMin,
    greetingCooldownMax: finite(input.greetingCooldownMax, 18, greetingCooldownMin, 240),
    manualCrossingHeadingThreshold: finite(input.manualCrossingHeadingThreshold, 0.5, -1, 1),
  };
}

export function createNpcWorld(
  seed: string,
  orchestration: Partial<NpcOrchestrationConfig> = {},
): NpcWorld {
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
    control: new Map(),
    animation: new Map(),
    social: new Map(),
    orchestration: resolveNpcOrchestrationConfig(orchestration),
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

/** Manual control outranks autonomous; otherwise the lexicographically smaller ID proceeds. */
export function npcMoverHasPriority(world: NpcWorld, id: string, other: string): boolean {
  const aManual = world.control.get(id)?.mode === "manual";
  const bManual = world.control.get(other)?.mode === "manual";
  if (aManual !== bManual) return aManual;
  const aCrossing = Boolean(world.crossing.get(id)?.active);
  const bCrossing = Boolean(world.crossing.get(other)?.active);
  if (aCrossing !== bCrossing) return aCrossing;
  return id < other;
}

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
      world.control,
      world.animation,
      world.social,
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
    const variation = 0.9 + rng.float() * 0.2;
    world.locomotion.set(id, {
      speed: world.orchestration.walkSpeed * variation,
      runSpeed: world.orchestration.runSpeed * variation,
      radius: NPC_RADIUS,
    });
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
      yieldSeconds: 0,
    });
    world.crossing.set(id, { active: null, waiting: 0, retry: 0 });
    world.appearance.set(id, { skin: AGENT_SKINS[rng.integer(0, 3)] ?? AGENT_SKINS[0] });
    world.control.set(id, {
      mode: "autonomous",
      direction: [0, 0],
      run: false,
      stopRequested: false,
      greetSequence: 0,
    });
    world.animation.set(id, {
      phase: "idle",
      sequence: 0,
      attentionTargetId: null,
      beat: null,
    });
    world.social.set(id, {
      nextGreetingTick: greetingTick(world, id, 0),
      greetUntilTick: -1,
    });
  }
}

function greetingTick(world: NpcWorld, id: string, sequence: number): number {
  const rng = new SeededRandom(`${world.seed}:${id}:greet:${sequence}`);
  const { greetingCooldownMin: min, greetingCooldownMax: max } = world.orchestration;
  return world.tick + Math.round((min + rng.float() * (max - min)) / SIMULATION_STEP);
}

function beginGreeting(world: NpcWorld, id: string, targetId: string | null): void {
  const control = world.control.get(id),
    directive = world.animation.get(id),
    social = world.social.get(id);
  if (!control || !directive || !social) return;
  control.greetSequence++;
  directive.attentionTargetId = targetId;
  social.nextGreetingTick = greetingTick(world, id, control.greetSequence);
  social.greetUntilTick = world.tick + Math.round(NPC_GREET_HOLD / SIMULATION_STEP);
}

export function takeNpcControl(world: NpcWorld, id: string): boolean {
  const control = world.control.get(id);
  if (!control) return false;
  control.mode = "manual";
  control.direction = [0, 0];
  control.run = false;
  control.stopRequested = true;
  const behavior = world.behavior.get(id);
  if (behavior) behavior.wander = false;
  if (!world.crossing.get(id)?.active) cancelNpcOrder(world, id);
  return true;
}

export function releaseNpcControl(world: NpcWorld, id: string): boolean {
  const control = world.control.get(id);
  if (!control) return false;
  control.mode = "autonomous";
  control.direction = [0, 0];
  control.run = false;
  control.stopRequested = false;
  const behavior = world.behavior.get(id);
  if (behavior) {
    behavior.wander = true;
    if (!world.crossing.get(id)?.active) behavior.status = "completed";
  }
  return true;
}

export function setNpcControlInput(
  world: NpcWorld,
  id: string,
  input: { direction: Point; run: boolean },
): boolean {
  const control = world.control.get(id);
  if (!control || control.mode !== "manual" || !input.direction.every(Number.isFinite))
    return false;
  const length = Math.hypot(...input.direction);
  control.direction =
    length > 1e-9 ? [input.direction[0] / length, input.direction[1] / length] : [0, 0];
  control.run = Boolean(input.run);
  control.stopRequested = length <= 1e-9;
  return true;
}

export function stopNpc(world: NpcWorld, id: string): boolean {
  const control = world.control.get(id);
  if (!control) return false;
  control.direction = [0, 0];
  control.run = false;
  control.stopRequested = true;
  if (!world.crossing.get(id)?.active) cancelNpcOrder(world, id);
  return true;
}

export function greetNpc(world: NpcWorld, id: string): boolean {
  const directive = world.animation.get(id);
  const control = world.control.get(id);
  const pose = world.poses.get(id);
  if (!directive || !control || !pose || world.crossing.get(id)?.active) return false;
  const target = world.ids
    .filter((other) => other !== id)
    .map((other) => ({
      id: other,
      pose: world.poses.get(other),
      control: world.control.get(other),
      crossing: world.crossing.get(other),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        id: string;
        pose: NpcPose;
        control: NpcControlState;
        crossing: NpcCrossing;
      } => Boolean(candidate.pose && candidate.control && candidate.crossing),
    )
    .sort(
      (a, b) =>
        distance2(pointOf(pose), pointOf(a.pose)) - distance2(pointOf(pose), pointOf(b.pose)) ||
        a.id.localeCompare(b.id),
    )[0];
  beginGreeting(world, id, target?.id ?? null);
  if (
    target &&
    target.control.mode === "autonomous" &&
    !target.crossing.active &&
    target.pose.speed <= 0.02 &&
    distance2(pointOf(pose), pointOf(target.pose)) <= world.orchestration.greetingRadius
  )
    beginGreeting(world, target.id, id);
  return true;
}

export function applyNpcMotionRequest(
  world: NpcWorld,
  network: PedestrianNetwork,
  id: string,
  request: NpcMotionRequest,
): boolean {
  const pose = world.poses.get(id);
  if (
    !pose ||
    ![request.translation.x, request.translation.y, request.translation.z, request.yawDelta].every(
      Number.isFinite,
    )
  )
    return false;
  const next: Point = [pose.x + request.translation.x, pose.z + request.translation.z];
  const crossing = Boolean(world.crossing.get(id)?.active);
  if (!network.visible(pointOf(pose), next, crossing)) return false;
  if (
    world.ids.some((other) => {
      if (other === id) return false;
      const otherPose = world.poses.get(other);
      return otherPose ? distance2(next, pointOf(otherPose)) < NPC_RADIUS * 2 : false;
    })
  )
    return false;
  pose.x = next[0];
  pose.z = next[1];
  pose.y = network.height(next);
  pose.yaw = wrap(pose.yaw + request.yawDelta);
  return true;
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
function nearLeg(point: Point, leg: NpcLeg, radius: number): boolean {
  for (let i = 1; i < leg.points.length; i++) {
    const a = leg.points[i - 1],
      b = leg.points[i];
    if (a && b && segmentDistance(point, a, b) < radius) return true;
  }
  return false;
}

type NpcStepFailure = "boundary" | "pedestrian";

function npcStepCandidate(
  world: NpcWorld,
  network: PedestrianNetwork,
  pose: NpcPose,
  next: Point,
  yaw: number,
  speed: number,
  vx: number,
  vz: number,
  nearby: string[],
  old: Map<string, NpcPose>,
  crossing: boolean,
  leg: NpcLeg | undefined,
  radius: number,
): NpcPose | NpcStepFailure {
  if (!network.visible(pointOf(pose), next, crossing)) return "boundary";
  if (crossing && leg && !nearLeg(next, leg, 0.2)) {
    const start = leg.points[0];
    if (!start || distance2(next, start) >= distance2(pointOf(pose), start) - 1e-9)
      return "boundary";
  }
  for (const other of nearby) {
    if (crossing && !world.crossing.get(other)?.active) continue;
    const op = old.get(other);
    if (!op) continue;
    const relative: Point = [pose.x - op.x, pose.z - op.z];
    const future: Point = [
      relative[0] + (vx - Math.sin(op.yaw) * op.speed) * 0.5,
      relative[1] + (vz - Math.cos(op.yaw) * op.speed) * 0.5,
    ];
    if (segmentDistance([0, 0], relative, future) < radius * 2 + 0.015) return "pedestrian";
    const oc = world.crossing.get(other),
      on = world.navigation.get(other),
      reservedLeg = on?.legs[on.leg];
    if (!crossing && oc?.active && reservedLeg && nearLeg(next, reservedLeg, NPC_RADIUS * 2 + 0.04))
      return "pedestrian";
  }
  return { x: next[0], z: next[1], y: network.height(next), yaw, speed };
}

/** Conservative swept circular body envelopes include offset pivots and portal predictions. */
export function canEnterNpcCrossing(
  world: NpcWorld,
  id: string,
  leg: NpcLeg,
  traffic?: NpcTraffic,
): boolean {
  const end = leg.points[leg.points.length - 1],
    start = leg.points[0];
  if (!end || !start) return false;
  for (const other of world.ids) {
    if (other === id) continue;
    const pose = world.poses.get(other),
      state = world.crossing.get(other),
      nav = world.navigation.get(other);
    if (pose) {
      const at = pointOf(pose);
      if (distance2(at, end) < NPC_RADIUS * 3) return false;
      // Sidewalk waiters at the approach must not occupy the reserved corridor.
      if (
        distance2(at, start) > CROSSING_APPROACH_IGNORE &&
        nearLeg(at, leg, NPC_RADIUS * 2 + 0.05)
      )
        return false;
    }
    const active = nav?.legs[nav.leg];
    if (state?.active && active) {
      if (active.crossingId === leg.crossingId) {
        if (pose && distance2(pointOf(pose), start) < CROSSING_FOLLOW_GAP) return false;
      } else if (active.points.some((p) => nearLeg(p, leg, NPC_RADIUS * 2 + 0.05))) return false;
    }
  }
  if (!traffic?.vehicles.length) return true;
  const locomotion = world.locomotion.get(id);
  const speed = world.orchestration.runCrossings
    ? (locomotion?.runSpeed ?? NPC_RUN_SPEED)
    : (locomotion?.speed ?? NPC_SPEED);
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

function isCrossingApproach(network: PedestrianNetwork, id: string): boolean {
  return (network.outgoing.get(id) ?? []).some((edge) => edge.crossing);
}

function atCrossingApproach(network: PedestrianNetwork, pose: NpcPose): boolean {
  const node = network.nodes.get(`s:${Math.floor(pose.x)},${Math.floor(pose.z)}`);
  return Boolean(
    node && isCrossingApproach(network, node.id) && distance2(node.point, pointOf(pose)) < 0.55,
  );
}

function intendsCrossing(world: NpcWorld, id: string, crossingId: string): boolean {
  const crossing = world.crossing.get(id),
    nav = world.navigation.get(id);
  if (!nav || crossing?.active) return false;
  const current = nav.legs[nav.leg],
    next = nav.legs[nav.leg + 1];
  return current?.crossingId === crossingId || next?.crossingId === crossingId;
}

function crossingQueueHold(
  world: NpcWorld,
  network: PedestrianNetwork,
  id: string,
  pose: NpcPose,
  start: Point,
  crossingId: string,
): Point | undefined {
  const waiters = world.ids.filter((other) => intendsCrossing(world, other, crossingId));
  const rank = Math.max(0, waiters.indexOf(id));
  const dist = CROSSING_QUEUE_BASE + rank * CROSSING_QUEUE_SPACING;
  const tryHold = (bx: number, bz: number) => {
    const span = Math.hypot(bx, bz);
    if (span < 1e-6) return undefined;
    const hold: Point = [start[0] + (bx / span) * dist, start[1] + (bz / span) * dist];
    return network.safe(hold) && network.visible(pointOf(pose), hold) ? hold : undefined;
  };
  const nav = world.navigation.get(id);
  const prev = nav?.legs[(nav.leg ?? 0) - 1];
  if (prev?.points[0]) {
    const origin = prev.points[0];
    const held = tryHold(origin[0] - start[0], origin[1] - start[1]);
    if (held) return held;
  }
  const fromPose = tryHold(pose.x - start[0], pose.z - start[1]);
  if (fromPose) return fromPose;
  for (const [dx, dz] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as Point[]) {
    const held = tryHold(dx, dz);
    if (held) return held;
  }
  return undefined;
}

function wanderDestination(
  world: NpcWorld,
  network: PedestrianNetwork,
  id: string,
): Point | undefined {
  const pose = world.poses.get(id),
    b = world.behavior.get(id);
  if (!pose || !b) return undefined;
  const rng = new SeededRandom(`${world.seed}:${id}:order:${b.sequence++}`),
    start = nearestPedestrianNode(network, pointOf(pose)),
    at = pointOf(pose);
  const midBlock: PedestrianNode[] = [],
    reachable: PedestrianNode[] = [];
  for (const node of network.nodes.values()) {
    if (node.component !== start?.component || distance2(node.point, at) <= 0.5) continue;
    reachable.push(node);
    if (!isCrossingApproach(network, node.id)) midBlock.push(node);
  }
  const options = midBlock.length ? midBlock : reachable;
  const destination = options[rng.integer(0, Math.max(0, options.length - 1))];
  if (!destination) return undefined;
  const jitter: Point = [
    destination.point[0] + (rng.float() - 0.5) * 0.4,
    destination.point[1] + (rng.float() - 0.5) * 0.4,
  ];
  return network.safe(jitter) ? jitter : destination.point;
}

function wander(world: NpcWorld, network: PedestrianNetwork, id: string): void {
  const b = world.behavior.get(id),
    pose = world.poses.get(id);
  if (!b || !pose) return;
  if (b.order?.kind === "moveTo" && b.status === "completed") {
    if (atCrossingApproach(network, pose)) {
      const next = wanderDestination(world, network, id);
      if (next) {
        issueNpcOrder(world, network, id, { kind: "moveTo", point: next }, true);
        return;
      }
    }
    const rng = new SeededRandom(`${world.seed}:${id}:order:${b.sequence++}`);
    issueNpcOrder(world, network, id, { kind: "wait", seconds: 1 + rng.float() * 2 }, true);
    return;
  }
  const destination = wanderDestination(world, network, id);
  if (destination) issueNpcOrder(world, network, id, { kind: "moveTo", point: destination }, true);
  else {
    b.reason = "No reachable destination";
    b.wander = false;
  }
}

function scheduleAutonomousGreetings(world: NpcWorld, network: PedestrianNetwork): void {
  const used = new Set<string>();
  for (const id of world.ids) {
    if (used.has(id)) continue;
    const control = world.control.get(id),
      social = world.social.get(id),
      pose = world.poses.get(id),
      crossing = world.crossing.get(id);
    if (
      control?.mode !== "autonomous" ||
      !social ||
      !pose ||
      pose.speed > 0.02 ||
      crossing?.active ||
      (crossing?.waiting ?? 0) > 0 ||
      (world.behavior.get(id)?.yieldSeconds ?? 0) > 0.05 ||
      world.tick < social.nextGreetingTick ||
      (social.greetUntilTick >= 0 && world.tick <= social.greetUntilTick) ||
      atCrossingApproach(network, pose)
    )
      continue;
    const crowd = world.ids.filter((other) => {
      if (other === id) return false;
      const otherPose = world.poses.get(other);
      return otherPose ? distance2(pointOf(pose), pointOf(otherPose)) <= 0.55 : false;
    }).length;
    if (crowd >= 3) continue;
    const partner = world.ids
      .filter((other) => other !== id && !used.has(other))
      .map((other) => ({
        id: other,
        pose: world.poses.get(other),
        control: world.control.get(other),
        crossing: world.crossing.get(other),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          id: string;
          pose: NpcPose;
          control: NpcControlState;
          crossing: NpcCrossing;
        } =>
          Boolean(candidate.pose && candidate.control && candidate.crossing) &&
          candidate.control?.mode === "autonomous" &&
          !candidate.crossing?.active &&
          (candidate.pose?.speed ?? 1) <= 0.02 &&
          distance2(pointOf(pose), pointOf(candidate.pose as NpcPose)) <=
            world.orchestration.greetingRadius,
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!partner) continue;
    used.add(id);
    used.add(partner.id);
    beginGreeting(world, id, partner.id);
    beginGreeting(world, partner.id, id);
  }
}

function manualCrossingLeg(
  world: NpcWorld,
  network: PedestrianNetwork,
  pose: NpcPose,
  direction: Point,
): NpcLeg | null {
  const node = nearestPedestrianNode(network, pointOf(pose));
  if (!node || distance2(node.point, pointOf(pose)) > 0.32) return null;
  const candidates = (network.outgoing.get(node.id) ?? [])
    .filter((edge) => edge.crossing)
    .map((edge) => {
      const end = edge.points[edge.points.length - 1] as Point,
        length = Math.max(distance2(edge.points[0] as Point, end), 1e-9),
        dot =
          ((end[0] - (edge.points[0]?.[0] ?? 0)) * direction[0] +
            (end[1] - (edge.points[0]?.[1] ?? 0)) * direction[1]) /
          length;
      return { edge, dot };
    })
    .filter(({ dot }) => dot >= world.orchestration.manualCrossingHeadingThreshold)
    .sort((a, b) => b.dot - a.dot || a.edge.id.localeCompare(b.edge.id));
  const edge = candidates[0]?.edge;
  if (!edge) return null;
  const points = smoothPoints(network, [pointOf(pose), ...edge.points], true);
  return { points, crossingId: edge.id, length: lengthOf(points) };
}

function updateAnimationDirectives(world: NpcWorld): void {
  for (const id of world.ids) {
    const pose = world.poses.get(id),
      control = world.control.get(id),
      crossing = world.crossing.get(id),
      directive = world.animation.get(id),
      social = world.social.get(id);
    if (!pose || !control || !directive) continue;
    if (control.greetSequence > directive.sequence) {
      directive.sequence = control.greetSequence;
      directive.phase = "greet";
      directive.beat = "wave";
      continue;
    }
    if (social && social.greetUntilTick >= 0 && world.tick <= social.greetUntilTick) {
      directive.phase = "greet";
      directive.beat = null;
      continue;
    }
    directive.beat = null;
    directive.attentionTargetId = null;
    directive.phase = crossing?.active
      ? "run"
      : pose.speed <= 0.015
        ? "idle"
        : control.mode === "manual" && control.run
          ? "run"
          : "walk";
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
  scheduleAutonomousGreetings(world, network);
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
  const yielded = new Set<string>();
  for (const id of world.ids) {
    const pose = old.get(id),
      b = world.behavior.get(id),
      nav = world.navigation.get(id),
      cross = world.crossing.get(id),
      body = world.locomotion.get(id),
      control = world.control.get(id);
    if (!pose || !b || !nav || !cross || !body || !control) continue;
    if (b.wander && ["completed", "failed"].includes(b.status)) wander(world, network, id);
    if (b.status === "pending" && b.order && !cross.active)
      issueNpcOrder(world, network, id, b.order, b.wander);
    let target: Point | undefined,
      leg = nav.legs[nav.leg];
    if (control.mode === "manual" && !cross.active) {
      b.wander = false;
      if (!control.stopRequested && Math.hypot(...control.direction) > 1e-9) {
        const crossingLeg = manualCrossingLeg(world, network, pose, control.direction);
        if (crossingLeg) {
          nav.legs = [crossingLeg];
          nav.leg = 0;
          nav.cursor = 0;
          leg = crossingLeg;
          b.status = "active";
          b.reason = "Waiting to run across safely";
        } else {
          const distance = Math.max(body.radius * 2, 0.3),
            next: Point = [
              pose.x + control.direction[0] * distance,
              pose.z + control.direction[1] * distance,
            ];
          if (network.visible(pointOf(pose), next)) {
            target = next;
            b.status = "active";
            b.reason = control.run ? "Running under user control" : "Walking under user control";
          } else {
            b.reason = "Manual movement blocked by boundary or obstacle";
          }
          nav.legs = [];
          nav.leg = 0;
          nav.cursor = 0;
          leg = undefined;
        }
      } else {
        nav.legs = [];
        nav.leg = 0;
        nav.cursor = 0;
        leg = undefined;
        b.status = "active";
        b.reason = "Stopped under user control";
      }
    }
    if (!target && b.order?.kind === "wait" && b.status === "active" && !cross.active) {
      b.remaining = Math.max(0, b.remaining - dt);
      if (b.remaining <= 1e-9) {
        b.status = "completed";
        b.reason = "Wait completed";
      }
    } else if (!target && (b.status === "active" || cross.active) && leg) {
      const end = leg.points[leg.points.length - 1] as Point;
      const nextLeg = nav.legs[nav.leg + 1];
      const arrival =
        nextLeg?.crossingId && !leg.crossingId
          ? 0.16
          : nav.leg >= nav.legs.length - 1
            ? NPC_GOAL_ARRIVAL
            : NPC_LEG_ARRIVAL;
      if (distance2(pointOf(pose), end) < arrival) {
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
            let rerouted = false;
            if (b.wander && cross.waiting >= YIELD_NEW_DESTINATION_SECONDS) {
              const next = wanderDestination(world, network, id);
              if (next) {
                issueNpcOrder(world, network, id, { kind: "moveTo", point: next }, true);
                rerouted = true;
              }
            } else if (cross.waiting >= 10 && nav.destination) {
              nav.penalized.add(leg.crossingId);
              issueNpcOrder(
                world,
                network,
                id,
                { kind: "moveTo", point: nav.destination },
                b.wander,
              );
              rerouted = true;
            }
            if (rerouted) {
              leg = nav.legs[nav.leg];
              admitted = Boolean(leg && !leg.crossingId);
              if (leg?.crossingId && !cross.active) {
                admitted = canEnterNpcCrossing(world, id, leg, traffic);
                if (admitted) {
                  cross.active = leg.crossingId;
                  cross.waiting = 0;
                }
              }
            }
            if (!admitted && leg?.crossingId) {
              const start = leg.points[0];
              const hold = start
                ? crossingQueueHold(world, network, id, pose, start, leg.crossingId)
                : undefined;
              if (hold) target = hold;
            }
          }
        }
        if (admitted && leg) {
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
    } else if (!target && b.status === "active" && b.order?.kind === "moveTo") {
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
      if (cross.waiting > 0 && neighbors(pose).some((other) => other !== id)) yielded.add(id);
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
    const requestedSpeed =
      cross.active && world.orchestration.runCrossings
        ? body.runSpeed
        : control.mode === "manual" && control.run
          ? body.runSpeed
          : body.speed;
    const approachCap = cross.waiting > 0 && !cross.active ? remaining * 2 : goalDistance * 2;
    const desiredSpeed =
      Math.abs(turn) > 0.9
        ? Math.min(NPC_TURN_CREEP, requestedSpeed, approachCap)
        : Math.min(requestedSpeed, approachCap);
    const speed = Math.max(
      0,
      Math.min(pose.speed + 0.8 * dt, Math.max(pose.speed - 0.8 * dt, desiredSpeed)),
    );
    let accepted: NpcPose | undefined;
    let pedestrianBlock = false;
    let boundaryBlock = false;
    for (const angle of cross.active ? [0] : [0, -0.3, 0.3, -0.6, 0.6, -0.9, 0.9]) {
      const heading =
          pose.yaw +
          Math.max(-Math.PI * dt, Math.min(Math.PI * dt, wrap(desired + angle - pose.yaw))),
        vx = Math.sin(heading) * speed,
        vz = Math.cos(heading) * speed;
      const next: Point = [pose.x + vx * dt, pose.z + vz * dt];
      const result = npcStepCandidate(
        world,
        network,
        pose,
        next,
        heading,
        speed,
        vx,
        vz,
        nearby,
        old,
        !!cross.active,
        leg,
        body.radius,
      );
      if (result === "boundary") {
        boundaryBlock = true;
        continue;
      }
      if (result === "pedestrian") {
        pedestrianBlock = true;
        continue;
      }
      accepted = result;
      break;
    }
    if (!accepted && !cross.active) {
      const stepSpeed = speed > 1e-6 ? speed : requestedSpeed;
      const rightX = Math.cos(desired),
        rightZ = -Math.sin(desired);
      for (const sign of [1, -1]) {
        const probe: Point = [
          pose.x + rightX * NPC_SIDESTEP * sign,
          pose.z + rightZ * NPC_SIDESTEP * sign,
        ];
        if (!network.visible(pointOf(pose), probe)) {
          boundaryBlock = true;
          continue;
        }
        const vx = rightX * stepSpeed * sign,
          vz = rightZ * stepSpeed * sign;
        const next: Point = [pose.x + vx * dt, pose.z + vz * dt];
        const result = npcStepCandidate(
          world,
          network,
          pose,
          next,
          yaw,
          stepSpeed,
          vx,
          vz,
          nearby,
          old,
          false,
          undefined,
          body.radius,
        );
        if (result === "boundary") {
          boundaryBlock = true;
          continue;
        }
        if (result === "pedestrian") {
          pedestrianBlock = true;
          continue;
        }
        accepted = result;
        break;
      }
    }
    proposed.set(id, accepted ?? { ...pose, yaw, speed: 0 });
    if (!accepted) {
      yielded.add(id);
      b.reason = pedestrianBlock
        ? "Yielding to another pedestrian"
        : boundaryBlock
          ? "Yielding to a boundary"
          : "Yielding to another pedestrian";
    }
  }
  // Stop only the lower-priority mover, then recheck against stopped agents until stable.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of world.ids) {
      const a = old.get(id),
        ap = proposed.get(id);
      if (!a || !ap) continue;
      for (const other of neighbors(a)) {
        if (other <= id) continue;
        const otherPose = old.get(other),
          bp = proposed.get(other);
        if (!otherPose || !bp) continue;
        if (
          segmentDistance(
            [0, 0],
            [a.x - otherPose.x, a.z - otherPose.z],
            [ap.x - bp.x, ap.z - bp.z],
          ) >=
          NPC_RADIUS * 2 - 1e-8
        )
          continue;
        const loser = npcMoverHasPriority(world, id, other) ? other : id;
        const winner = loser === id ? other : id;
        const stop = (who: string) => {
          const before = old.get(who),
            after = proposed.get(who);
          if (!before || !after || distance2(pointOf(before), pointOf(after)) <= 0) return false;
          proposed.set(who, { ...before, speed: 0 });
          yielded.add(who);
          const lost = world.behavior.get(who);
          if (lost) lost.reason = "Yielding to another pedestrian";
          return true;
        };
        if (stop(loser) || stop(winner)) changed = true;
      }
    }
  }
  world.poses = proposed;
  for (const id of world.ids) {
    const b = world.behavior.get(id),
      nav = world.navigation.get(id),
      cross = world.crossing.get(id),
      control = world.control.get(id);
    if (!b || !nav || !cross || !control) continue;
    if (!yielded.has(id)) {
      b.yieldSeconds = 0;
      continue;
    }
    b.yieldSeconds += dt;
    const hops = Math.floor(b.yieldSeconds / YIELD_REPATH_SECONDS);
    const previousHops = Math.floor((b.yieldSeconds - dt) / YIELD_REPATH_SECONDS);
    if (!cross.active) {
      const current = nav.legs[nav.leg],
        poseNow = world.poses.get(id);
      const skipHops = Math.floor(b.yieldSeconds / 0.4),
        previousSkip = Math.floor((b.yieldSeconds - dt) / 0.4);
      if (current && !current.crossingId && poseNow && skipHops > previousSkip) {
        while (
          nav.cursor < current.points.length - 1 &&
          distance2(pointOf(poseNow), current.points[nav.cursor] as Point) < 0.25
        )
          nav.cursor++;
      }
    }
    if (
      hops > previousHops &&
      control.mode !== "manual" &&
      !cross.active &&
      cross.waiting <= 0 &&
      b.order?.kind === "moveTo"
    ) {
      if (hops >= 2 && b.wander) {
        const next = wanderDestination(world, network, id);
        if (next) issueNpcOrder(world, network, id, { kind: "moveTo", point: next }, true);
        b.yieldSeconds = 0;
      } else if (nav.destination) {
        issueNpcOrder(world, network, id, { kind: "moveTo", point: nav.destination }, b.wander);
      }
    }
  }
  world.tick++;
  updateAnimationDirectives(world);
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
        controlMode: world.control.get(id)?.mode ?? "autonomous",
        animationPhase: world.animation.get(id)?.phase ?? "idle",
        attentionTargetId: world.animation.get(id)?.attentionTargetId ?? null,
        crossingRun: Boolean(world.crossing.get(id)?.active) && world.orchestration.runCrossings,
        stopRequested: world.control.get(id)?.stopRequested ?? false,
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
