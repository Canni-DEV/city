import type { CityDocumentV1 } from "./domain.js";
import { SeededRandom } from "./rng.js";
import {
  neighborKeys,
  occupiedRoadSet,
  type Point,
  parsePointKey,
  pointKey,
  type RoadTile,
} from "./road-tiles.js";
import { pedestrianNeighbors, pedestrianWalkableSet, sidewalkKeySet } from "./sidewalks.js";

export const AGENT_SKINS = [
  "skaterMaleA",
  "skaterFemaleA",
  "cyborgFemaleA",
  "criminalMaleA",
] as const;
export type AgentSkin = (typeof AGENT_SKINS)[number];
export type AgentClip = "idle" | "run";
export type AgentLane = 0 | 1;

/** Cells per second. SIM-005: about one-third cell/s so Kenney Run reads as a walk. */
export const DEFAULT_AGENT_SPEED = 1.85 / 3;
export const DEFAULT_AGENT_WAIT_LIMIT = 0.7;
/** SIM-010: offset from cell center toward the right-hand lane. */
export const AGENT_LANE_OFFSET = 0.2;

/** SIM-006: 8–16 on 96 Auto/high; Low may reduce the count. */
export function agentCountFor(mapSize: 64 | 96 | 128, quality: "low" | "medium" | "high"): number {
  const auto = mapSize <= 64 ? 8 : mapSize >= 128 ? 16 : 12;
  if (quality === "low") return Math.max(4, Math.round(auto / 2));
  return auto;
}

/**
 * SIM-007: walkability is injected so a later player policy can leave the default
 * graph without rewriting the mover or avatar.
 */
export interface WalkPolicy {
  readonly kind: string;
  isWalkable(cell: Point): boolean;
  neighbors(cell: Point): Point[];
  sampleDestination(from: Point, rng: SeededRandom): Point | undefined;
  allCells(): Point[];
  spawnCells(): Point[];
}

function cellsFromSet(walkable: ReadonlySet<string>): Point[] {
  return [...walkable].sort().map(parsePointKey);
}

export function createGridWalkPolicy(walkable: ReadonlySet<string>, kind = "grid"): WalkPolicy {
  const cells = cellsFromSet(walkable);
  return {
    kind,
    isWalkable: (cell) => walkable.has(pointKey(cell)),
    neighbors(cell) {
      return neighborKeys(cell)
        .filter(({ key }) => walkable.has(key))
        .map(({ point }) => point);
    },
    sampleDestination(from, rng) {
      const fromKey = pointKey(from);
      const options = cells.filter((cell) => pointKey(cell) !== fromKey);
      if (options.length === 0) return undefined;
      return options[rng.integer(0, options.length - 1)];
    },
    allCells: () => cells.map((cell) => [...cell] as Point),
    spawnCells: () => cells.map((cell) => [...cell] as Point),
  };
}

/** Occupied `roadGraph` cells. Kept injectable; M3.6.1 default is sidewalks. */
export function createRoadWalkPolicy(tiles: readonly RoadTile[]): WalkPolicy {
  return createGridWalkPolicy(occupiedRoadSet(tiles), "road-graph");
}

/** SIM-002/008/009: sidewalks plus corner crossings; destinations stay on sidewalks. */
export function createSidewalkWalkPolicy(document: CityDocumentV1): WalkPolicy {
  const walkable = pedestrianWalkableSet(document);
  const sidewalks = sidewalkKeySet(document);
  const destinations = cellsFromSet(sidewalks);
  const base = createGridWalkPolicy(walkable, "sidewalk-graph");
  return {
    ...base,
    neighbors(cell) {
      return pedestrianNeighbors(cell, walkable, sidewalks);
    },
    sampleDestination(from, rng) {
      const fromKey = pointKey(from);
      const options = destinations.filter((cell) => pointKey(cell) !== fromKey);
      if (options.length === 0) return undefined;
      return options[rng.integer(0, options.length - 1)];
    },
    spawnCells: () => destinations.map((cell) => [...cell] as Point),
  };
}

export function walkableCells(policy: WalkPolicy, tiles?: readonly RoadTile[]): Point[] {
  const listed = policy.allCells();
  if (listed.length > 0) return listed;
  if (!tiles) return [];
  return [...occupiedRoadSet(tiles)]
    .filter((key) => policy.isWalkable(parsePointKey(key)))
    .sort()
    .map(parsePointKey);
}

export function findPath(policy: WalkPolicy, start: Point, goal: Point): Point[] | undefined {
  if (!policy.isWalkable(start) || !policy.isWalkable(goal)) return undefined;
  const startKey = pointKey(start);
  const goalKey = pointKey(goal);
  if (startKey === goalKey) return [[...start]];

  const cameFrom = new Map<string, string>();
  const cost = new Map([[startKey, 0]]);
  const points = new Map<string, Point>([[startKey, [...start]]]);
  const frontier: Array<{ key: string; score: number; order: number }> = [
    { key: startKey, score: manhattan(start, goal), order: 0 },
  ];
  let order = 1;

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.score - right.score || left.order - right.order);
    const current = frontier.shift();
    if (!current) break;
    if (current.key === goalKey) return reconstructPath(cameFrom, points, startKey, goalKey);
    const currentPoint = points.get(current.key);
    if (!currentPoint) continue;
    const currentCost = cost.get(current.key) ?? Number.POSITIVE_INFINITY;
    for (const neighbor of policy.neighbors(currentPoint)) {
      const nextKey = pointKey(neighbor);
      const nextCost = currentCost + 1;
      if (nextCost >= (cost.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      cost.set(nextKey, nextCost);
      cameFrom.set(nextKey, current.key);
      points.set(nextKey, [...neighbor]);
      frontier.push({
        key: nextKey,
        score: nextCost + manhattan(neighbor, goal),
        order,
      });
      order += 1;
    }
  }
  return undefined;
}

export interface AgentRuntimeState {
  id: string;
  index: number;
  cell: Point;
  nextCell: Point | null;
  lane: AgentLane;
  nextLane: AgentLane | null;
  progress: number;
  heading: number;
  path: Point[];
  destination: Point;
  destCount: number;
  waitSeconds: number;
  moving: boolean;
  skin: AgentSkin;
  clip: AgentClip;
}

export function clipForAgent(agent: Pick<AgentRuntimeState, "moving">): AgentClip {
  return agent.moving ? "run" : "idle";
}

export function laneReservationKey(cell: Point, lane: AgentLane): string {
  return `${pointKey(cell)}:${lane}`;
}

export function preferredLane(_from: Point, _to: Point): AgentLane {
  return 1;
}

function laneOffset(heading: number, lane: AgentLane): [number, number] {
  const dx = Math.sin(heading);
  const dy = Math.cos(heading);
  const sign = lane === 1 ? 1 : -1;
  return [-dy * AGENT_LANE_OFFSET * sign, dx * AGENT_LANE_OFFSET * sign];
}

export function agentWorldPosition(agent: AgentRuntimeState): [number, number, number] {
  const [x, z] = agent.cell;
  const current = laneOffset(agent.heading, agent.lane);
  if (!agent.nextCell) return [x + 0.5 + current[0], 0, z + 0.5 + current[1]];
  const t = Math.min(Math.max(agent.progress, 0), 1);
  const heading = headingBetween(agent.cell, agent.nextCell);
  const next = laneOffset(heading, agent.nextLane ?? agent.lane);
  return [
    x + 0.5 + (agent.nextCell[0] - x) * t + current[0] * (1 - t) + next[0] * t,
    0,
    z + 0.5 + (agent.nextCell[1] - z) * t + current[1] * (1 - t) + next[1] * t,
  ];
}

function pickLane(
  cell: Point,
  reserved: Map<string, string>,
  agentId: string,
  preferred: AgentLane,
): AgentLane | undefined {
  const order: AgentLane[] = preferred === 1 ? [1, 0] : [0, 1];
  for (const lane of order) {
    const owner = reserved.get(laneReservationKey(cell, lane));
    if (!owner || owner === agentId) return lane;
  }
  return undefined;
}

export function spawnAgents(input: {
  seed: string;
  tiles: readonly RoadTile[];
  count: number;
  policy?: WalkPolicy;
}): AgentRuntimeState[] {
  const policy = input.policy ?? createRoadWalkPolicy(input.tiles);
  const cells = policy.spawnCells();
  const slots: Array<{ cell: Point; lane: AgentLane }> = [];
  for (const lane of [0, 1] as const) {
    for (const cell of cells) slots.push({ cell, lane });
  }
  const count = Math.min(Math.max(input.count, 0), slots.length);
  const taken = new Set<string>();
  const agents: AgentRuntimeState[] = [];
  for (let index = 0; index < count; index += 1) {
    const rng = new SeededRandom(`${input.seed}:agent:${index}`);
    const free = slots.filter((slot) => !taken.has(laneReservationKey(slot.cell, slot.lane)));
    if (free.length === 0) break;
    const slot = free[rng.integer(0, free.length - 1)];
    if (!slot) break;
    taken.add(laneReservationKey(slot.cell, slot.lane));
    const skin = AGENT_SKINS[rng.integer(0, AGENT_SKINS.length - 1)] ?? AGENT_SKINS[0];
    const destination = policy.sampleDestination(
      slot.cell,
      new SeededRandom(`${input.seed}:agent:${index}:dest:0`),
    );
    const path = destination ? (findPath(policy, slot.cell, destination)?.slice(1) ?? []) : [];
    agents.push({
      id: `agent:${index}`,
      index,
      cell: [...slot.cell],
      nextCell: null,
      lane: slot.lane,
      nextLane: null,
      progress: 0,
      heading: 0,
      path,
      destination: destination ? [...destination] : [...slot.cell],
      destCount: destination ? 1 : 0,
      waitSeconds: 0,
      moving: false,
      skin,
      clip: "idle",
    });
  }
  return agents;
}

export interface TickAgentsInput {
  policy: WalkPolicy;
  dt: number;
  seed: string;
  speed?: number;
  waitLimit?: number;
}

/** SIM-003/004/010: time and RNG are inputs; lane reservation waits then replans. */
export function tickAgents(
  agents: readonly AgentRuntimeState[],
  input: TickAgentsInput,
): AgentRuntimeState[] {
  const speed = input.speed ?? DEFAULT_AGENT_SPEED;
  const waitLimit = input.waitLimit ?? DEFAULT_AGENT_WAIT_LIMIT;
  const next = agents.map(cloneAgent);
  const reserved = reservationMap(next);
  for (const agent of [...next].sort((left, right) => left.index - right.index)) {
    stepAgent(agent, input.policy, input.seed, input.dt, speed, waitLimit, reserved);
    agent.clip = clipForAgent(agent);
  }
  return next;
}

export function reservationMap(agents: readonly AgentRuntimeState[]): Map<string, string> {
  const reserved = new Map<string, string>();
  for (const agent of agents) {
    reserved.set(laneReservationKey(agent.cell, agent.lane), agent.id);
    if (agent.nextCell && agent.nextLane !== null) {
      reserved.set(laneReservationKey(agent.nextCell, agent.nextLane), agent.id);
    }
  }
  return reserved;
}

function stepAgent(
  agent: AgentRuntimeState,
  policy: WalkPolicy,
  seed: string,
  dt: number,
  speed: number,
  waitLimit: number,
  reserved: Map<string, string>,
): void {
  let remaining = Math.max(0, dt) * speed;
  let guard = 0;
  while (guard < 8) {
    guard += 1;
    if (!agent.nextCell) {
      const stepTo = agent.path[0];
      if (!stepTo) {
        agent.moving = false;
        return;
      }
      const lane = pickLane(stepTo, reserved, agent.id, preferredLane(agent.cell, stepTo));
      if (lane === undefined) {
        agent.moving = false;
        agent.waitSeconds += dt;
        if (agent.waitSeconds >= waitLimit) {
          agent.waitSeconds = 0;
          assignDestination(agent, policy, seed);
        }
        return;
      }
      reserved.set(laneReservationKey(stepTo, lane), agent.id);
      agent.nextCell = [...stepTo];
      agent.nextLane = lane;
      agent.progress = 0;
      agent.waitSeconds = 0;
      agent.heading = headingBetween(agent.cell, stepTo);
    }
    const travel = Math.min(remaining, 1 - agent.progress);
    agent.progress += travel;
    remaining -= travel;
    agent.moving = true;
    if (agent.progress + 1e-9 < 1) return;
    completeStep(agent, policy, seed, reserved);
  }
}

function completeStep(
  agent: AgentRuntimeState,
  policy: WalkPolicy,
  seed: string,
  reserved: Map<string, string>,
): void {
  const previous = laneReservationKey(agent.cell, agent.lane);
  if (agent.nextCell) agent.cell = [...agent.nextCell];
  if (agent.nextLane !== null) agent.lane = agent.nextLane;
  agent.nextCell = null;
  agent.nextLane = null;
  agent.progress = 0;
  agent.path = agent.path.slice(1);
  if (reserved.get(previous) === agent.id) reserved.delete(previous);
  reserved.set(laneReservationKey(agent.cell, agent.lane), agent.id);
  if (sameCell(agent.cell, agent.destination)) {
    agent.path = [];
    assignDestination(agent, policy, seed);
  }
}

function assignDestination(agent: AgentRuntimeState, policy: WalkPolicy, seed: string): void {
  const rng = new SeededRandom(`${seed}:agent:${agent.index}:dest:${agent.destCount}`);
  const destination = policy.sampleDestination(agent.cell, rng);
  agent.destCount += 1;
  if (!destination) {
    agent.path = [];
    return;
  }
  agent.destination = [...destination];
  agent.path = findPath(policy, agent.cell, destination)?.slice(1) ?? [];
}

function cloneAgent(agent: AgentRuntimeState): AgentRuntimeState {
  return {
    ...agent,
    cell: [...agent.cell],
    nextCell: agent.nextCell ? [...agent.nextCell] : null,
    path: agent.path.map((cell) => [...cell] as Point),
    destination: [...agent.destination],
  };
}

function reconstructPath(
  cameFrom: Map<string, string>,
  points: Map<string, Point>,
  startKey: string,
  goalKey: string,
): Point[] | undefined {
  const path: Point[] = [];
  let cursor = goalKey;
  while (true) {
    const point = points.get(cursor);
    if (!point) return undefined;
    path.push([...point]);
    if (cursor === startKey) break;
    const parent = cameFrom.get(cursor);
    if (!parent) return undefined;
    cursor = parent;
  }
  return path.reverse();
}

function manhattan(from: Point, to: Point): number {
  return Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
}

function sameCell(left: Point, right: Point): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function headingBetween(from: Point, to: Point): number {
  return Math.atan2(to[0] - from[0], to[1] - from[1]);
}
