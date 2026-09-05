import { Delaunay } from "d3-delaunay";
import type { CityDocumentV1, GenerationParameters, MapSize } from "./domain.js";
import { CityDocumentSchema } from "./domain.js";
import { deriveProceduralId } from "./ids.js";
import { assignZones, createBlocks, createLots, validateLandCity } from "./land-generator.js";
import type { PlacementAsset } from "./placement-assets.js";
import {
  applyDistrictThemes,
  occupancyFromRoads,
  placeBuildingsAndParks,
  placeDecoration,
  validatePlacedCity,
} from "./placement-generator.js";
import { normalizeGenerationParameters } from "./presets.js";
import { hashText, SeededRandom } from "./rng.js";
import {
  connectLocalComponents,
  expandGateKeys,
  fatStraightAvenueCells,
  openAvenueGaps,
  paintClass,
  paintLocalMesh,
  pruneInternalDeadEnds,
  rebuildRoadGraph,
  routeCardinalCorridor,
  stitchAvenueJunctions,
  subdivideLargeVoids,
  widenAvenueCorridors,
} from "./road-mesh.js";
import {
  CARDINALS,
  DIRECTION_DELTA,
  isAvenueClass,
  isLiveCarriagewayShoulder,
  logicalConnections,
  neighborKeys,
  occupiedCellsForRoadTile,
  occupiedRoadSet,
  type Point,
  pairLaneMates,
  parsePointKey,
  pointKey,
  type RoadClass,
  resolveRoadTiles,
  tileMatchesNeighbors,
} from "./road-tiles.js";
import { createSidewalks, validateSidewalks } from "./sidewalks.js";
import type { GenerationStage } from "./worker-protocol.js";

export const GENERATOR_VERSION = "0.6.6";

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
  path: Point[];
  roadClass: RoadClass;
}

export interface RoadGenerationInput {
  id: string;
  name: string;
  seed: string;
  parameters: GenerationParameters;
  timestamp: string;
  assets: readonly PlacementAsset[];
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

function randomFor(seed: string, attempt: number, stage: string): SeededRandom {
  return new SeededRandom(`${GENERATOR_VERSION}:${seed}:${attempt}:${stage}`);
}

export function deriveAttemptSeed(seed: string, attempt: number): string {
  return `${seed}::${GENERATOR_VERSION}::attempt-${attempt}`;
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
  const points: Point[] = [];
  const minimumDistance = size / (Math.sqrt(count) + 2.3);
  const candidates: Array<{ point: Point; score: number }> = [];
  for (let y = 3; y < size - 3; y += 1) {
    for (let x = 3; x < size - 3; x += 1) {
      const index = indexOf(size, x, y);
      if (mask[index]) candidates.push({ point: [x, y], score: densityField[index] ?? 0 });
    }
  }

  while (points.length < count) {
    let best: Point | undefined;
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
    const position: Point =
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
    const nearestList = districts
      .map((district) => ({
        ...district,
        distance: distanceSquared(node.position, district.node.position),
      }))
      .sort((left, right) => left.distance - right.distance || left.index - right.index);
    const links = regularity >= 35 ? nearestList.slice(0, 2) : nearestList.slice(0, 1);
    for (const nearest of links) {
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
    Math.max(extras.length > 0 ? 1 : 0, Math.round(extras.length * (0.4 + regularity / 180))),
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

function assignEndpointDirections(
  graph: readonly CandidateEdge[],
  nodes: readonly GraphNode[],
  size: MapSize,
): Map<string, (typeof CARDINALS)[number]> {
  const result = new Map<string, (typeof CARDINALS)[number]>();
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex];
    if (!node) continue;
    const incident = graph
      .map((edge, edgeIndex) => ({ edge, edgeIndex }))
      .filter(({ edge }) => edge.from === nodeIndex || edge.to === nodeIndex)
      .sort((left, right) => left.edgeIndex - right.edgeIndex);
    const used = new Set<(typeof CARDINALS)[number]>();
    for (const { edge, edgeIndex } of incident) {
      const otherIndex = edge.from === nodeIndex ? edge.to : edge.from;
      const other = nodes[otherIndex];
      if (!other) continue;
      let ordered = [...CARDINALS].sort((left, right) => {
        const vectorX = other.position[0] - node.position[0];
        const vectorY = other.position[1] - node.position[1];
        const leftDelta = DIRECTION_DELTA[left];
        const rightDelta = DIRECTION_DELTA[right];
        const leftScore = leftDelta[0] * vectorX + leftDelta[1] * vectorY;
        const rightScore = rightDelta[0] * vectorX + rightDelta[1] * vectorY;
        return rightScore - leftScore;
      });
      if (node.kind === "gate") {
        const inward =
          node.position[0] === 0
            ? "east"
            : node.position[0] === size - 1
              ? "west"
              : node.position[1] === 0
                ? "south"
                : "north";
        ordered = [inward, ...ordered.filter((direction) => direction !== inward)];
      }
      const direction = ordered.find((candidate) => !used.has(candidate)) ?? ordered[0];
      if (!direction) throw new Error("Unable to choose a road endpoint direction.");
      used.add(direction);
      result.set(`${edgeIndex}:${nodeIndex}`, direction);
    }
  }
  return result;
}

function stepFrom(point: Point, direction: (typeof CARDINALS)[number], size: MapSize): Point {
  const delta = DIRECTION_DELTA[direction];
  const next: Point = [point[0] + delta[0], point[1] + delta[1]];
  if (next[0] < 0 || next[1] < 0 || next[0] >= size || next[1] >= size) return point;
  return next;
}

function routeGraph(
  graph: readonly CandidateEdge[],
  nodes: readonly GraphNode[],
  size: MapSize,
  mask: readonly boolean[],
): RoutedEdge[] {
  const occupied = new Set<string>();
  const blocked = new Set<string>();
  const exits = assignEndpointDirections(graph, nodes, size);
  return graph.map((edge, index) => {
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    if (!from || !to) throw new Error("Graph edge references an absent node.");
    const fromDir = exits.get(`${index}:${edge.from}`) ?? "east";
    const toDir = exits.get(`${index}:${edge.to}`) ?? "west";
    const fromStep = stepFrom(from.position, fromDir, size);
    const toStep = stepFrom(to.position, toDir, size);
    const middle = routeCardinalCorridor(fromStep, toStep, size, mask, occupied, blocked);
    const path = [from.position, ...middle, to.position].filter(
      (point, pointIndex, values) =>
        pointIndex === 0 || pointKey(point) !== pointKey(values[pointIndex - 1] ?? point),
    );
    for (const point of path) occupied.add(pointKey(point));
    const length =
      Math.abs(from.position[0] - to.position[0]) + Math.abs(from.position[1] - to.position[1]);
    return {
      ...edge,
      path,
      roadClass:
        from.kind === "gate" || to.kind === "gate" || length >= size * 0.45
          ? "arterial"
          : "collector",
    };
  });
}

function rasterizeNetwork(
  routed: readonly RoutedEdge[],
  nodes: readonly GraphNode[],
  size: MapSize,
  mask: readonly boolean[],
  regularity: number,
  random: SeededRandom,
): Map<string, RoadClass> {
  const classes = new Map<string, RoadClass>();
  for (const node of nodes) {
    paintClass(classes, node.position, node.kind === "gate" ? "arterial" : "collector");
  }
  for (const edge of routed) {
    for (const point of edge.path) paintClass(classes, point, edge.roadClass);
  }
  const protectedKeys = new Set(nodes.map((node) => pointKey(node.position)));
  widenAvenueCorridors(classes, size, protectedKeys);
  stitchAvenueJunctions(classes, size, mask);
  paintLocalMesh(size, mask, classes, regularity, random);
  connectLocalComponents(size, mask, classes);
  subdivideLargeVoids(size, mask, classes);
  const seedKeys = expandGateKeys(
    new Set(nodes.map((node) => pointKey(node.position))),
    pairLaneMates(classes),
  );
  pruneInternalDeadEnds(classes, seedKeys);
  stitchAvenueJunctions(classes, size, mask);
  return classes;
}

function createDocument(
  input: RoadGenerationInput,
  attempt: number,
  mask: boolean[],
  densityField: number[],
  seeds: readonly GraphNode[],
  classes: Map<string, RoadClass>,
): CityDocumentV1 {
  const mates = pairLaneMates(classes);
  const rebuilt = rebuildRoadGraph(
    classes,
    seeds.map((node) => ({ ...node, position: [...node.position] as Point })),
    mates,
  );
  const tiles = resolveRoadTiles(
    classes,
    input.parameters.size,
    deriveAttemptSeed(input.seed, attempt),
    input.parameters.roundaboutFrequency,
    mask,
    mates,
  );
  for (const tile of tiles) {
    for (const [x, y] of occupiedCellsForRoadTile(tile)) {
      if (x >= 0 && y >= 0 && x < input.parameters.size && y < input.parameters.size) {
        mask[indexOf(input.parameters.size, x, y)] = true;
      }
    }
  }
  const districts = seeds
    .filter((node) => node.kind === "district")
    .map((node) => ({
      id: node.id,
      center: node.position,
      theme: "colormap",
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
      nodes: rebuilt.nodes,
      edges: rebuilt.edges.map((edge, index) => ({
        id: deriveProceduralId(input.seed, attempt, "road-edge", index),
        from: edge.from,
        to: edge.to,
        cells: edge.cells,
        roadClass: edge.roadClass,
      })),
      cells: tiles.map((tile, index) => ({
        id: deriveProceduralId(input.seed, attempt, "road-cell", index),
        position: tile.position,
        assetId: tile.assetId,
        rotation: tile.rotation,
        roadClass:
          occupiedCellsForRoadTile(tile)
            .map((cell) => classes.get(pointKey(cell)))
            .find((value) => value !== undefined) ?? "local",
      })),
    },
    blocks: [],
    lots: [],
    sidewalks: [],
    entities: {},
  };
  return CityDocumentSchema.parse(document);
}

function roadClassesFromDocument(document: CityDocumentV1): Map<string, RoadClass> {
  const classes = new Map<string, RoadClass>();
  for (const cell of document.roadGraph.cells) {
    if (!cell.roadClass) continue;
    for (const point of occupiedCellsForRoadTile(cell)) paintClass(classes, point, cell.roadClass);
  }
  if (classes.size > 0) {
    const occupied = occupiedRoadSet(document.roadGraph.cells);
    for (const key of occupied) {
      if (!classes.has(key)) classes.set(key, "local");
    }
    return classes;
  }
  for (const edge of document.roadGraph.edges) {
    for (const cell of edge.cells) paintClass(classes, cell, edge.roadClass);
  }
  const occupied = occupiedRoadSet(document.roadGraph.cells);
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of occupied) {
      if (classes.has(key)) continue;
      const point = parsePointKey(key);
      let best: RoadClass | undefined;
      for (const { key: neighbor } of neighborKeys(point)) {
        const value = classes.get(neighbor);
        if (!isAvenueClass(value)) continue;
        if (value === "arterial" || best !== "arterial") best = value;
      }
      if (best) {
        classes.set(key, best);
        changed = true;
      }
    }
  }
  for (const key of occupied) {
    if (!classes.has(key)) classes.set(key, "local");
  }
  return classes;
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
    if (visited.size !== nodes.size) {
      const missing = document.roadGraph.nodes
        .filter((node) => !visited.has(node.id))
        .map((node) => `${node.kind}@${node.position.join(",")}`)
        .join("; ");
      issues.push(`road graph is disconnected (${visited.size}/${nodes.size}: ${missing})`);
    }
  }
  const occupied = occupiedRoadSet(document.roadGraph.cells);
  const classes = roadClassesFromDocument(document);
  const mates = pairLaneMates(classes);
  const seedPositions = new Set(
    document.roadGraph.nodes
      .filter((node) => node.kind === "gate" || node.kind === "district")
      .map((node) => pointKey(node.position)),
  );
  for (const key of [...seedPositions]) {
    const mate = mates.get(key);
    if (mate) seedPositions.add(mate);
  }
  const cellIds = new Set<string>();
  const covered = new Set<string>();
  for (const cell of document.roadGraph.cells) {
    if (cellIds.has(cell.id)) issues.push(`duplicate road cell ID ${cell.id}`);
    cellIds.add(cell.id);
    if (!tileMatchesNeighbors(cell, occupied, mates)) {
      const logical = logicalConnections(cell.position, occupied, mates);
      const key = pointKey(cell.position);
      const neighborClass = neighborKeys(cell.position)
        .map(
          ({ key: next }) =>
            `${next}:${classes.get(next) ?? (occupied.has(next) ? "occ" : "empty")}`,
        )
        .join(" ");
      issues.push(
        `invalid road tile at ${key} (${cell.assetId} yaw ${cell.rotation}; logical ${logical.join(",") || "none"}; mate ${mates.get(key) ?? "none"}; class ${classes.get(key) ?? "none"}; nbr ${neighborClass})`,
      );
    }
    for (const point of occupiedCellsForRoadTile(cell)) {
      const key = pointKey(point);
      if (covered.has(key)) issues.push(`overlapping road occupancy at ${key}`);
      covered.add(key);
    }
  }
  if (covered.size !== occupied.size) issues.push("road occupancy does not match resolved tiles");
  const occupiedList = [...occupied];
  if (occupiedList[0]) {
    const seen = new Set([occupiedList[0]]);
    const queue = [occupiedList[0]];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (!current) continue;
      const [x, y] = current.split(",").map(Number);
      for (const { key } of neighborKeys([x ?? 0, y ?? 0])) {
        if (occupied.has(key) && !seen.has(key)) {
          seen.add(key);
          queue.push(key);
        }
      }
    }
    if (seen.size !== occupied.size) issues.push("road cells are disconnected");
  }
  if (fatStraightAvenueCells(classes, document.map.size).length > 0) {
    issues.push("avenue carriageway wider than two cells");
  }
  if (openAvenueGaps(classes, document.map.size, document.map.boundaryMask).length > 0) {
    issues.push("avenue corridors leave a 1-cell gap");
  }
  for (const key of occupied) {
    const [x, y] = key.split(",").map(Number);
    const point: Point = [x ?? 0, y ?? 0];
    if (logicalConnections(point, occupied, mates).length <= 1 && !seedPositions.has(key)) {
      if (isLiveCarriagewayShoulder(point, occupied, mates)) continue;
      issues.push(`internal dead end at ${key}`);
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
    sidewalks: document.sidewalks,
    blocks: document.blocks,
    lots: document.lots,
    entities: document.entities,
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
  input = { ...input, parameters: normalizeGenerationParameters(input.parameters) };
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
    await checkpoint(hooks, "routing", 52, "Routing avenues and the local street mesh");
    const routed = routeGraph(graph, nodes, input.parameters.size, mask);
    const classes = rasterizeNetwork(
      routed,
      nodes,
      input.parameters.size,
      mask,
      input.parameters.roadRegularity,
      randomFor(attemptSeed, attempt, "mesh"),
    );
    await checkpoint(hooks, "tiles", 70, "Resolving curves, junctions, and roundabouts");
    const document = createDocument(input, attempt, [...mask], densityField, nodes, classes);
    await checkpoint(hooks, "blocks", 76, "Finding free regions and creating blocks");
    document.blocks = createBlocks(document);
    await checkpoint(hooks, "sidewalks", 80, "Laying sidewalk rings around manzanas");
    document.sidewalks = createSidewalks(document);
    await checkpoint(hooks, "lots", 83, "Subdividing lots with sidewalk frontage");
    document.lots = createLots(document);
    await checkpoint(hooks, "zones", 89, "Assigning zones within area quotas");
    assignZones(document);
    await checkpoint(hooks, "placement", 91, "Placing buildings, parks, and trees");
    const occupancy = occupancyFromRoads(document);
    const placed = placeBuildingsAndParks(
      document,
      input.assets,
      randomFor(attemptSeed, attempt, "placement"),
      occupancy,
    );
    await checkpoint(hooks, "decoration", 95, "Adding decoration and district themes");
    applyDistrictThemes(document);
    const decorated = placeDecoration(
      document,
      input.assets,
      randomFor(attemptSeed, attempt, "decoration"),
      occupancy,
      placed.length,
    );
    document.entities = Object.fromEntries(
      [...placed, ...decorated]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((entity) => [entity.id, entity]),
    );
    await checkpoint(hooks, "validation", 98, "Validating placement, roads, and zone areas");
    finalIssues = [
      ...validateRoadCity(document),
      ...validateLandCity(document),
      ...validateSidewalks(document),
      ...validatePlacedCity(document, input.assets),
      ...(hooks.validateAttempt?.(document) ?? []),
    ];
    if (finalIssues.length === 0) {
      await checkpoint(hooks, "validation", 100, "City buildings and decoration ready");
      return document;
    }
  }
  throw new RoadGenerationError(finalIssues);
}
