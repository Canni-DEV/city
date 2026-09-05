import { SeededRandom } from "./rng.js";
import {
  neighborKeys,
  occupiedRoadSet,
  type Point,
  parsePointKey,
  pointKey,
  type RoadTile,
} from "./road-tiles.js";

export const AGENT_SKINS = [
  "skaterMaleA",
  "skaterFemaleA",
  "cyborgFemaleA",
  "criminalMaleA",
] as const;
export type AgentSkin = (typeof AGENT_SKINS)[number];
export type AgentClip = "idle" | "run";

/** Cells per second. SIM-005: about one-third cell/s so Kenney Run reads as a walk. */
export const DEFAULT_AGENT_SPEED = 1.85 / 3;
export const DEFAULT_AGENT_WAIT_LIMIT = 0.7;

/** SIM-006: 8–16 on 96 Auto/high; Low may reduce the count. */
export function agentCountFor(mapSize: 64 | 96 | 128, quality: "low" | "medium" | "high"): number {
  const auto = mapSize <= 64 ? 8 : mapSize >= 128 ? 16 : 12;
  if (quality === "low") return Math.max(4, Math.round(auto / 2));
  return auto;
}

/**
 * SIM-007: walkability is injected so a later player policy can leave the road
 * graph without rewriting the mover or avatar.
 */
export interface WalkPolicy {
  readonly kind: string;
  isWalkable(cell: Point): boolean;
  neighbors(cell: Point): Point[];
  sampleDestination(from: Point, rng: SeededRandom): Point | undefined;
}

export function createGridWalkPolicy(walkable: ReadonlySet<string>, kind = "grid"): WalkPolicy {
  const cells = [...walkable].sort();
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
      const options = cells.filter((key) => key !== fromKey);
      if (options.length === 0) return undefined;
      const key = options[rng.integer(0, options.length - 1)];
      return key ? parsePointKey(key) : undefined;
    },
  };
}

/** SIM-002: occupied `roadGraph` cells, one 4-connected component. */
export function createRoadWalkPolicy(tiles: readonly RoadTile[]): WalkPolicy {
  return createGridWalkPolicy(occupiedRoadSet(tiles), "road-graph");
}

export function walkableCells(policy: WalkPolicy, tiles: readonly RoadTile[]): Point[] {
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

export function agentWorldPosition(agent: AgentRuntimeState): [number, number, number] {
  const [x, z] = agent.cell;
  if (!agent.nextCell) return [x + 0.5, 0, z + 0.5];
  const t = Math.min(Math.max(agent.progress, 0), 1);
  return [x + 0.5 + (agent.nextCell[0] - x) * t, 0, z + 0.5 + (agent.nextCell[1] - z) * t];
}

export function spawnAgents(input: {
  seed: string;
  tiles: readonly RoadTile[];
  count: number;
  policy?: WalkPolicy;
}): AgentRuntimeState[] {
  const policy = input.policy ?? createRoadWalkPolicy(input.tiles);
  const cells = walkableCells(policy, input.tiles);
  const count = Math.min(Math.max(input.count, 0), cells.length);
  const taken = new Set<string>();
  const agents: AgentRuntimeState[] = [];
  for (let index = 0; index < count; index += 1) {
    const rng = new SeededRandom(`${input.seed}:agent:${index}`);
    const free = cells.filter((cell) => !taken.has(pointKey(cell)));
    if (free.length === 0) break;
    const cell = free[rng.integer(0, free.length - 1)];
    if (!cell) break;
    taken.add(pointKey(cell));
    const skin = AGENT_SKINS[rng.integer(0, AGENT_SKINS.length - 1)] ?? AGENT_SKINS[0];
    const destination = policy.sampleDestination(
      cell,
      new SeededRandom(`${input.seed}:agent:${index}:dest:0`),
    );
    const path = destination ? (findPath(policy, cell, destination)?.slice(1) ?? []) : [];
    agents.push({
      id: `agent:${index}`,
      index,
      cell: [...cell],
      nextCell: null,
      progress: 0,
      heading: 0,
      path,
      destination: destination ? [...destination] : [...cell],
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

/** SIM-003/004: time and RNG are inputs; reservation waits then replans. */
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
    reserved.set(pointKey(agent.cell), agent.id);
    if (agent.nextCell) reserved.set(pointKey(agent.nextCell), agent.id);
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
      const stepKey = pointKey(stepTo);
      const owner = reserved.get(stepKey);
      if (owner && owner !== agent.id) {
        agent.moving = false;
        agent.waitSeconds += dt;
        if (agent.waitSeconds >= waitLimit) {
          agent.waitSeconds = 0;
          assignDestination(agent, policy, seed);
        }
        return;
      }
      reserved.set(stepKey, agent.id);
      agent.nextCell = [...stepTo];
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
  const previous = pointKey(agent.cell);
  if (agent.nextCell) agent.cell = [...agent.nextCell];
  agent.nextCell = null;
  agent.progress = 0;
  agent.path = agent.path.slice(1);
  if (reserved.get(previous) === agent.id) reserved.delete(previous);
  reserved.set(pointKey(agent.cell), agent.id);
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
