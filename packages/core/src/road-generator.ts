import { Delaunay } from "d3-delaunay";
import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";
import type { CityDocumentV1, GenerationParameters, MapSize } from "./domain.js";
import { CityDocumentSchema } from "./domain.js";
import { deriveProceduralId } from "./ids.js";
import type { GenerationStage } from "./worker-protocol.js";

export const GENERATOR_VERSION = "0.2.0";

type Point = [number, number];
type MutablePoint = Point;
type Direction = "north" | "east" | "south" | "west";

interface GraphNode {
  id: string;
  position: Point;
  kind: "gate" | "district";
}

interface CandidateEdge {
  from: number;
  to: number;
  distance: number;
}

interface RoutedEdge extends CandidateEdge {
  path: MutablePoint[];
  roadClass: "arterial" | "collector";
}

export interface RoadGenerationInput {
  id: string;
  name: string;
  seed: string;
  parameters: GenerationParameters;
  timestamp: string;
}

export interface GenerationProgress {
  stage: GenerationStage;
  percent: number;
  message: string;
}

export interface RoadGenerationHooks {
  onProgress?: (progress: GenerationProgress) => void;
  shouldCancel?: () => boolean;
  yieldControl?: () => Promise<void>;
  validateAttempt?: (document: CityDocumentV1) => readonly string[];
}

export class GenerationCancelledError extends Error {
  constructor() {
    super("City generation was cancelled.");
    this.name = "GenerationCancelledError";
  }
}

export class RoadGenerationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Road generation failed after three deterministic attempts: ${issues.join("; ")}`);
    this.name = "RoadGenerationError";
    this.issues = issues;
  }
}

class SeededRandom {
  readonly #generator;

  constructor(seed: string) {
    this.#generator = xoroshiro128plus(hashText(seed));
  }

  float(): number {
    return (this.#generator.next() >>> 0) / 4_294_967_296;
  }

  integer(minimum: number, maximum: number): number {
    return minimum + Math.floor(this.float() * (maximum - minimum + 1));
  }
}

const DIRECTIONS: ReadonlyArray<{
  name: Direction;
  delta: Point;
}> = [
  { name: "north", delta: [0, -1] },
  { name: "east", delta: [1, 0] },
  { name: "south", delta: [0, 1] },
  { name: "west", delta: [-1, 0] },
];

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

function randomFor(seed: string, attempt: number, stage: string): SeededRandom {
  return new SeededRandom(`${GENERATOR_VERSION}:${seed}:${attempt}:${stage}`);
}

export function deriveAttemptSeed(seed: string, attempt: number): string {
  return `${seed}::${GENERATOR_VERSION}::attempt-${attempt}`;
}

function pointKey([x, y]: Point): string {
  return `${x},${y}`;
}

function indexOf(size: number, x: number, y: number): number {
  return y * size + x;
}

function distanceSquared(left: Point, right: Point): number {
  const x = left[0] - right[0];
  const y = left[1] - right[1];
  return x * x + y * y;
}

function gateCountFor(size: MapSize): number {
  if (size === 64) return 2;
  if (size === 96) return 3;
  return 4;
}

async function checkpoint(
  hooks: RoadGenerationHooks,
  stage: GenerationStage,
  percent: number,
  message: string,
): Promise<void> {
  if (hooks.shouldCancel?.()) throw new GenerationCancelledError();
  hooks.onProgress?.({ stage, percent, message });
  await hooks.yieldControl?.();
  if (hooks.shouldCancel?.()) throw new GenerationCancelledError();
}

function createMask(size: MapSize, random: SeededRandom) {
  const mask = Array.from({ length: size * size }, () => false);
  const densityField = Array.from({ length: size * size }, () => 0);
  const centerX = (size - 1) / 2 + (random.float() - 0.5) * size * 0.08;
  const centerY = (size - 1) / 2 + (random.float() - 0.5) * size * 0.08;
  const phaseA = random.float() * Math.PI * 2;
  const phaseB = random.float() * Math.PI * 2;
  const aspectX = 0.88 + random.float() * 0.08;
  const aspectY = 0.84 + random.float() * 0.12;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const normalizedX = (x - centerX) / (size * 0.5 * aspectX);
      const normalizedY = (y - centerY) / (size * 0.5 * aspectY);
      const angle = Math.atan2(normalizedY, normalizedX);
      const distance = Math.hypot(normalizedX, normalizedY);
      const boundary =
        0.9 + Math.sin(angle * 3 + phaseA) * 0.055 + Math.sin(angle * 5 + phaseB) * 0.035;
      const inside = distance <= boundary;
      const index = indexOf(size, x, y);
      mask[index] = inside;
      densityField[index] = inside ? Number(Math.max(0, 1 - distance / boundary).toFixed(4)) : 0;
    }
  }
  return { mask, densityField };
}

function placeDistricts(
  size: MapSize,
  count: number,
  mask: readonly boolean[],
  densityField: readonly number[],
  random: SeededRandom,
): GraphNode[] {
  const points: MutablePoint[] = [];
  const minimumDistance = size / (Math.sqrt(count) + 2.3);
  const candidates: Array<{ point: MutablePoint; score: number }> = [];
  for (let y = 3; y < size - 3; y += 1) {
    for (let x = 3; x < size - 3; x += 1) {
      const index = indexOf(size, x, y);
      if (mask[index]) candidates.push({ point: [x, y], score: densityField[index] ?? 0 });
    }
  }

  while (points.length < count) {
    let best: MutablePoint | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let sample = 0; sample < Math.min(320, candidates.length); sample += 1) {
      const candidate = candidates[random.integer(0, candidates.length - 1)];
      if (!candidate) continue;
      const nearest = points.length
        ? Math.sqrt(Math.min(...points.map((point) => distanceSquared(point, candidate.point))))
        : minimumDistance;
      if (points.length > 0 && nearest < minimumDistance) continue;
      const score = nearest + candidate.score * size * 0.15 + random.float() * 0.01;
      if (score > bestScore) {
        best = candidate.point;
        bestScore = score;
      }
    }
    if (!best) {
      best = candidates
        .map((candidate) => ({
          point: candidate.point,
          distance: points.length
            ? Math.min(...points.map((point) => distanceSquared(point, candidate.point)))
            : Number.POSITIVE_INFINITY,
        }))
        .sort((left, right) => right.distance - left.distance)[0]?.point;
    }
    if (!best) throw new Error("Unable to place district centers inside the urban mask.");
    points.push([...best]);
  }

  return points.map((position, index) => ({
    id: deriveProceduralId("district", index),
    position,
    kind: "district",
  }));
}

function createGates(size: MapSize, seed: string, attempt: number): GraphNode[] {
  const random = randomFor(seed, attempt, "gates");
  const sides: Direction[] = ["north", "east", "south", "west"];
  const offset = random.integer(0, sides.length - 1);
  return Array.from({ length: gateCountFor(size) }, (_, index) => {
    const side = sides[(offset + index) % sides.length] ?? "north";
    const coordinate = Math.round(size * (0.28 + random.float() * 0.44));
    const position: MutablePoint =
      side === "north"
        ? [coordinate, 0]
        : side === "east"
          ? [size - 1, coordinate]
          : side === "south"
            ? [coordinate, size - 1]
            : [0, coordinate];
    return { id: deriveProceduralId("gate", index), position, kind: "gate" };
  });
}

function canonicalEdge(from: number, to: number, nodes: readonly GraphNode[]): CandidateEdge {
  const left = Math.min(from, to);
  const right = Math.max(from, to);
  return {
    from: left,
    to: right,
    distance: Math.sqrt(
      distanceSquared(nodes[left]?.position ?? [0, 0], nodes[right]?.position ?? [0, 0]),
    ),
  };
}

function buildGraph(nodes: readonly GraphNode[], regularity: number): CandidateEdge[] {
  const candidateMap = new Map<string, CandidateEdge>();
  const districtIndices = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.kind === "district")
    .map(({ index }) => index);
  const delaunay = Delaunay.from(districtIndices.map((index) => nodes[index]?.position ?? [0, 0]));
  for (let localIndex = 0; localIndex < districtIndices.length; localIndex += 1) {
    for (const localNeighbor of delaunay.neighbors(localIndex)) {
      const index = districtIndices[localIndex];
      const neighbor = districtIndices[localNeighbor];
      if (index === undefined || neighbor === undefined) continue;
      const edge = canonicalEdge(index, neighbor, nodes);
      candidateMap.set(`${edge.from}:${edge.to}`, edge);
    }
  }
  const districts = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.kind === "district");
  for (const { node, index } of nodes.map((node, index) => ({ node, index }))) {
    if (node.kind !== "gate") continue;
    const nearest = districts
      .map((district) => ({
        ...district,
        distance: distanceSquared(node.position, district.node.position),
      }))
      .sort((left, right) => left.distance - right.distance || left.index - right.index)[0];
    if (nearest) {
      const edge = canonicalEdge(index, nearest.index, nodes);
      candidateMap.set(`${edge.from}:${edge.to}`, edge);
    }
  }

  const candidates = [...candidateMap.values()].sort(
    (left, right) => left.distance - right.distance || left.from - right.from || left.to - right.to,
  );
  const parent = nodes.map((_, index) => index);
  const find = (value: number): number => {
    let current = value;
    while (parent[current] !== current) current = parent[current] ?? current;
    return current;
  };
  const tree: CandidateEdge[] = [];
  const extras: CandidateEdge[] = [];
  for (const edge of candidates) {
    const leftRoot = find(edge.from);
    const rightRoot = find(edge.to);
    if (leftRoot !== rightRoot) {
      parent[rightRoot] = leftRoot;
      tree.push(edge);
    } else extras.push(edge);
  }
  const extraCount = Math.min(
    extras.length,
    Math.max(1, Math.round(extras.length * (0.12 + regularity / 250))),
  );
  const selected = [...tree, ...extras.slice(0, extraCount)];
  const selectedKeys = new Set(selected.map((edge) => `${edge.from}:${edge.to}`));
  const degree = new Map<number, number>();
  for (const edge of selected) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  for (const districtIndex of districtIndices) {
    while ((degree.get(districtIndex) ?? 0) < 2) {
      const candidate = extras.find(
        (edge) =>
          !selectedKeys.has(`${edge.from}:${edge.to}`) &&
          (edge.from === districtIndex || edge.to === districtIndex),
      );
      if (!candidate) break;
      selected.push(candidate);
      selectedKeys.add(`${candidate.from}:${candidate.to}`);
      degree.set(candidate.from, (degree.get(candidate.from) ?? 0) + 1);
      degree.set(candidate.to, (degree.get(candidate.to) ?? 0) + 1);
    }
  }
  return selected;
}

interface FrontierState {
  point: MutablePoint;
  cost: number;
  score: number;
  order: number;
}

function routeAStar(
  start: Point,
  goal: Point,
  size: MapSize,
  mask: readonly boolean[],
  occupied: ReadonlySet<string>,
  blocked: ReadonlySet<string>,
  directionOffset: number,
): MutablePoint[] {
  const startKey = pointKey(start);
  const goalKey = pointKey(goal);
  const frontier: FrontierState[] = [{ point: [...start], cost: 0, score: 0, order: 0 }];
  const costs = new Map([[startKey, 0]]);
  const cameFrom = new Map<string, string>();
  const points = new Map<string, MutablePoint>([[startKey, [...start]]]);
  let order = 1;

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.score - right.score || left.order - right.order);
    const current = frontier.shift();
    if (!current) break;
    const currentKey = pointKey(current.point);
    if (currentKey === goalKey) break;
    for (let index = 0; index < DIRECTIONS.length; index += 1) {
      const direction = DIRECTIONS[(index + directionOffset) % DIRECTIONS.length];
      if (!direction) continue;
      const next: MutablePoint = [
        current.point[0] + direction.delta[0],
        current.point[1] + direction.delta[1],
      ];
      if (next[0] < 0 || next[1] < 0 || next[0] >= size || next[1] >= size) continue;
      const nextKey = pointKey(next);
      if (blocked.has(nextKey)) continue;
      const insideCost = mask[indexOf(size, next[0], next[1])] ? 1 : 4.5;
      const reuseCost = occupied.has(nextKey) ? 0.22 : insideCost;
      const newCost = current.cost + reuseCost;
      if (newCost >= (costs.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      costs.set(nextKey, newCost);
      cameFrom.set(nextKey, currentKey);
      points.set(nextKey, next);
      const heuristic = Math.abs(goal[0] - next[0]) + Math.abs(goal[1] - next[1]);
      frontier.push({ point: next, cost: newCost, score: newCost + heuristic, order });
      order += 1;
    }
  }

  if (!costs.has(goalKey)) throw new Error(`No route from ${startKey} to ${goalKey}`);
  const path: MutablePoint[] = [];
  let cursor = goalKey;
  while (true) {
    const point = points.get(cursor);
    if (!point) throw new Error(`Broken A* parent chain at ${cursor}`);
    path.push(point);
    if (cursor === startKey) break;
    const parent = cameFrom.get(cursor);
    if (!parent) throw new Error(`Broken A* parent link at ${cursor}`);
    cursor = parent;
  }
  return path.reverse();
}

function routeGraph(
  graph: readonly CandidateEdge[],
  nodes: readonly GraphNode[],
  size: MapSize,
  mask: readonly boolean[],
  seed: string,
  attempt: number,
): RoutedEdge[] {
  const occupied = new Set<string>();
  const blocked = new Set(nodes.map((node) => pointKey(node.position)));
  const endpointDirections = assignEndpointDirections(graph, nodes, size);
  return graph.map((edge, index) => {
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    if (!from || !to) throw new Error("Graph edge references an absent node.");
    const fromDirection = endpointDirections.get(`${index}:${edge.from}`) ?? DIRECTIONS[0];
    const toDirection = endpointDirections.get(`${index}:${edge.to}`) ?? DIRECTIONS[2];
    if (!fromDirection || !toDirection)
      throw new Error("Unable to assign road endpoint directions.");
    const fromStep: MutablePoint = [
      from.position[0] + fromDirection.delta[0],
      from.position[1] + fromDirection.delta[1],
    ];
    const toStep: MutablePoint = [
      to.position[0] + toDirection.delta[0],
      to.position[1] + toDirection.delta[1],
    ];
    const middle = routeAStar(
      fromStep,
      toStep,
      size,
      mask,
      occupied,
      blocked,
      hashText(`${seed}:${attempt}:${index}`) & 3,
    );
    const path = [from.position, ...middle, to.position].filter(
      (point, pointIndex, values) =>
        pointIndex === 0 || pointKey(point) !== pointKey(values[pointIndex - 1] ?? point),
    ) as MutablePoint[];
    for (const point of path) occupied.add(pointKey(point));
    return {
      ...edge,
      path,
      roadClass: from.kind === "gate" || to.kind === "gate" ? "arterial" : "collector",
    };
  });
}

function assignEndpointDirections(
  graph: readonly CandidateEdge[],
  nodes: readonly GraphNode[],
  size: MapSize,
): Map<string, (typeof DIRECTIONS)[number]> {
  const result = new Map<string, (typeof DIRECTIONS)[number]>();
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex];
    if (!node) continue;
    const incident = graph
      .map((edge, edgeIndex) => ({ edge, edgeIndex }))
      .filter(({ edge }) => edge.from === nodeIndex || edge.to === nodeIndex)
      .sort((left, right) => left.edgeIndex - right.edgeIndex);
    const used = new Set<Direction>();
    for (const { edge, edgeIndex } of incident) {
      const otherIndex = edge.from === nodeIndex ? edge.to : edge.from;
      const other = nodes[otherIndex];
      if (!other) continue;
      let ordered = [...DIRECTIONS].sort((left, right) => {
        const vectorX = other.position[0] - node.position[0];
        const vectorY = other.position[1] - node.position[1];
        const leftScore = left.delta[0] * vectorX + left.delta[1] * vectorY;
        const rightScore = right.delta[0] * vectorX + right.delta[1] * vectorY;
        return rightScore - leftScore;
      });
      if (node.kind === "gate") {
        ordered = [
          node.position[0] === 0
            ? DIRECTIONS[1]
            : node.position[0] === size - 1
              ? DIRECTIONS[3]
              : node.position[1] === 0
                ? DIRECTIONS[2]
                : DIRECTIONS[0],
        ].filter((direction): direction is (typeof DIRECTIONS)[number] => direction !== undefined);
      }
      const direction = ordered.find((candidate) => !used.has(candidate.name)) ?? ordered[0];
      if (!direction) throw new Error("Unable to choose a road endpoint direction.");
      used.add(direction.name);
      result.set(`${edgeIndex}:${nodeIndex}`, direction);
    }
  }
  return result;
}

function connectionNames(point: Point, roadKeys: ReadonlySet<string>): Direction[] {
  const connections: Direction[] = [];
  for (const direction of DIRECTIONS) {
    if (roadKeys.has(pointKey([point[0] + direction.delta[0], point[1] + direction.delta[1]]))) {
      connections.push(direction.name);
    }
  }
  return connections;
}

function rotationForSingle(direction: Direction): number {
  return { north: 0, east: 90, south: 180, west: 270 }[direction];
}

function resolveTile(
  connections: readonly Direction[],
  seed: string,
  roundaboutFrequency: number,
  point: Point,
): { assetId: string; rotation: number } {
  if (connections.length <= 1) {
    return { assetId: "roads:road-end", rotation: rotationForSingle(connections[0] ?? "north") };
  }
  if (connections.length === 2) {
    const set = new Set(connections);
    if ((set.has("north") && set.has("south")) || (set.has("east") && set.has("west"))) {
      return { assetId: "roads:road-straight", rotation: set.has("east") ? 90 : 0 };
    }
    const rotation =
      set.has("north") && set.has("east")
        ? 0
        : set.has("east") && set.has("south")
          ? 90
          : set.has("south") && set.has("west")
            ? 180
            : 270;
    return { assetId: "roads:road-bend", rotation };
  }
  if (connections.length === 3) {
    const missing =
      DIRECTIONS.find((direction) => !connections.includes(direction.name))?.name ?? "south";
    return { assetId: "roads:road-intersection", rotation: rotationForSingle(missing) };
  }
  const roll = (hashText(`${seed}:roundabout:${pointKey(point)}`) >>> 0) % 100;
  return roll < roundaboutFrequency
    ? { assetId: "roads:road-roundabout", rotation: 0 }
    : { assetId: "roads:road-crossroad", rotation: 0 };
}

function resolveRoadCells(
  routedEdges: readonly RoutedEdge[],
  seed: string,
  roundaboutFrequency: number,
) {
  const pointMap = new Map<string, MutablePoint>();
  for (const edge of routedEdges)
    for (const point of edge.path) pointMap.set(pointKey(point), point);
  const roadKeys = new Set(pointMap.keys());
  return [...pointMap.values()]
    .sort((left, right) => left[1] - right[1] || left[0] - right[0])
    .map((position, index) => {
      const tile = resolveTile(
        connectionNames(position, roadKeys),
        seed,
        roundaboutFrequency,
        position,
      );
      return {
        id: deriveProceduralId(seed, "road-cell", index),
        position,
        assetId: tile.assetId,
        rotation: tile.rotation,
      };
    });
}

function createDocument(
  input: RoadGenerationInput,
  attempt: number,
  mask: boolean[],
  densityField: number[],
  nodes: readonly GraphNode[],
  routedEdges: readonly RoutedEdge[],
): CityDocumentV1 {
  for (const edge of routedEdges) {
    for (const [x, y] of edge.path) mask[indexOf(input.parameters.size, x, y)] = true;
  }
  const districts = nodes
    .filter((node) => node.kind === "district")
    .map((node, index) => ({ id: node.id, center: node.position, theme: `district-${index + 1}` }));
  const roadNodes = nodes.map((node) => ({
    id: node.id,
    position: node.position,
    kind: node.kind,
  }));
  const roadEdges = routedEdges.map((edge, index) => ({
    id: deriveProceduralId(input.seed, attempt, "road-edge", index),
    from: nodes[edge.from]?.id ?? "",
    to: nodes[edge.to]?.id ?? "",
    cells: edge.path,
    roadClass: edge.roadClass,
  }));
  const document: CityDocumentV1 = {
    schemaVersion: 1,
    id: input.id,
    name: input.name,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
    generator: {
      version: GENERATOR_VERSION,
      seed: input.seed,
      attempt,
      parameters: input.parameters,
    },
    map: { size: input.parameters.size, cellSize: 1, boundaryMask: mask, densityField },
    districts,
    roadGraph: {
      nodes: roadNodes,
      edges: roadEdges,
      cells: resolveRoadCells(
        routedEdges,
        deriveAttemptSeed(input.seed, attempt),
        input.parameters.roundaboutFrequency,
      ),
    },
    blocks: [],
    lots: [],
    entities: {},
  };
  return CityDocumentSchema.parse(document);
}

function roadConnections(document: CityDocumentV1, position: Point): Direction[] {
  const roadKeys = new Set(document.roadGraph.cells.map((cell) => pointKey(cell.position)));
  return connectionNames(position, roadKeys);
}

export function validateRoadCity(document: CityDocumentV1): string[] {
  const issues: string[] = [];
  const nodes = new Map(document.roadGraph.nodes.map((node) => [node.id, node]));
  const gates = document.roadGraph.nodes.filter((node) => node.kind === "gate");
  if (gates.length !== gateCountFor(document.map.size))
    issues.push("incorrect external gate count");
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes.keys()) adjacency.set(node, new Set());
  for (const edge of document.roadGraph.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to))
      issues.push(`edge ${edge.id} has missing nodes`);
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
    for (let index = 1; index < edge.cells.length; index += 1) {
      const previous = edge.cells[index - 1];
      const current = edge.cells[index];
      if (!previous || !current) continue;
      if (Math.abs(previous[0] - current[0]) + Math.abs(previous[1] - current[1]) !== 1) {
        issues.push(`edge ${edge.id} contains a non-cardinal step`);
      }
    }
  }
  const firstNode = document.roadGraph.nodes[0]?.id;
  if (firstNode) {
    const visited = new Set([firstNode]);
    const queue = [firstNode];
    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (visited.size !== nodes.size) issues.push("road graph is disconnected");
  }
  const cellIds = new Set<string>();
  const gatePositions = new Set(gates.map((gate) => pointKey(gate.position)));
  for (const cell of document.roadGraph.cells) {
    if (cellIds.has(cell.id)) issues.push(`duplicate road cell ID ${cell.id}`);
    cellIds.add(cell.id);
    const connections = roadConnections(document, cell.position);
    if (connections.length === 1 && !gatePositions.has(pointKey(cell.position))) {
      issues.push(`internal dead end at ${pointKey(cell.position)}`);
    }
    const expected = resolveTile(
      connections,
      deriveAttemptSeed(document.generator.seed, document.generator.attempt),
      document.generator.parameters.roundaboutFrequency,
      cell.position,
    );
    if (cell.assetId !== expected.assetId || cell.rotation !== expected.rotation) {
      issues.push(`invalid road tile at ${pointKey(cell.position)}`);
    }
  }
  if (document.map.boundaryMask.length !== document.map.size ** 2) issues.push("invalid mask size");
  if (document.map.densityField.length !== document.map.size ** 2)
    issues.push("invalid density size");
  return issues;
}

function canonicalGeneratedData(document: CityDocumentV1) {
  return {
    generator: document.generator,
    map: document.map,
    districts: document.districts,
    roadGraph: document.roadGraph,
  };
}

export function hashGeneratedStructure(document: CityDocumentV1): string {
  return (hashText(JSON.stringify(canonicalGeneratedData(document))) >>> 0)
    .toString(16)
    .padStart(8, "0");
}

export async function generateRoadCity(
  input: RoadGenerationInput,
  hooks: RoadGenerationHooks = {},
): Promise<CityDocumentV1> {
  let finalIssues: readonly string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const attemptSeed = deriveAttemptSeed(input.seed, attempt);
    await checkpoint(hooks, "mask", 5, `Creating the urban boundary (attempt ${attempt + 1}/3)`);
    const { mask, densityField } = createMask(
      input.parameters.size,
      randomFor(attemptSeed, attempt, "mask"),
    );
    await checkpoint(hooks, "districts", 22, "Placing district centers and city gates");
    const districts = placeDistricts(
      input.parameters.size,
      input.parameters.districtCount,
      mask,
      densityField,
      randomFor(attemptSeed, attempt, "districts"),
    );
    const nodes = [...createGates(input.parameters.size, attemptSeed, attempt), ...districts];
    await checkpoint(hooks, "graph", 38, "Connecting the district graph");
    const graph = buildGraph(nodes, input.parameters.roadRegularity);
    await checkpoint(hooks, "routing", 52, "Routing modular streets");
    const routed = routeGraph(graph, nodes, input.parameters.size, mask, attemptSeed, attempt);
    await checkpoint(hooks, "tiles", 82, "Resolving curves, junctions, and roundabouts");
    const document = createDocument(input, attempt, [...mask], densityField, nodes, routed);
    await checkpoint(hooks, "validation", 94, "Validating the connected road network");
    finalIssues = [...validateRoadCity(document), ...(hooks.validateAttempt?.(document) ?? [])];
    if (finalIssues.length === 0) {
      await checkpoint(hooks, "validation", 100, "Road network ready");
      return document;
    }
  }
  throw new RoadGenerationError(finalIssues);
}
