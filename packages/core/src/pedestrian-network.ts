import type { CityDocumentV1 } from "./domain.js";
import type { DriveNetwork } from "./drive-network.js";
import type { Point } from "./road-tiles.js";
import { pedestrianWalkableSet, sidewalkKeySet } from "./sidewalks.js";
import { isCurbClassNonObstacle } from "./street-furniture.js";

/** SIM-020: reconstructible hybrid navigation, in world coordinates. */
export const NPC_RADIUS = 0.12;
// Sample spacing 0.025 with this inset conservatively covers the swept disk.
const STATIC_RADIUS = NPC_RADIUS + 0.005;
export const PARK_GRID = 0.1;
export interface PedestrianNode {
  id: string;
  point: Point;
  kind: "sidewalk" | "park";
  component: number;
}
export interface PedestrianEdge {
  id: string;
  from: string;
  to: string;
  points: Point[];
  length: number;
  crossing: boolean;
  trafficSegments: string[];
}
export interface PedestrianObstacle {
  id: string;
  center: Point;
  half: Point;
  yaw: number;
}
export interface PedestrianNetwork {
  nodes: Map<string, PedestrianNode>;
  edges: Map<string, PedestrianEdge>;
  outgoing: Map<string, PedestrianEdge[]>;
  sidewalks: Set<string>;
  parks: Set<string>;
  crossings: Set<string>;
  obstacles: PedestrianObstacle[];
  blocked: Point[];
  safe(point: Point, crossing?: boolean): boolean;
  visible(a: Point, b: Point, crossing?: boolean): boolean;
  height(point: Point): number;
}
export const distance2 = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const key = (x: number, z: number) => `${x},${z}`;
const cellKey = (p: Point) => key(Math.floor(p[0]), Math.floor(p[1]));
const cardinal: Point[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export function buildPedestrianNetwork(document: CityDocumentV1): PedestrianNetwork {
  const sidewalks = sidewalkKeySet(document),
    walkable = pedestrianWalkableSet(document);
  const crossings = new Set([...walkable].filter((k) => !sidewalks.has(k)));
  const parks = new Set(
    document.blocks
      .filter((b) => b.zone === "park")
      .flatMap((b) => b.cells.map((p) => key(...p)))
      .filter((k) => !walkable.has(k)),
  );
  const obstacles: PedestrianObstacle[] = Object.values(document.entities)
    .filter((e) => !isCurbClassNonObstacle(e))
    .map((e) => ({
      id: e.id,
      center: [e.transform.position[0], e.transform.position[2]],
      half: [
        (e.footprint.width * Math.abs(e.transform.scale[0])) / 2,
        (e.footprint.depth * Math.abs(e.transform.scale[2])) / 2,
      ],
      yaw: -(e.transform.rotation[1] * Math.PI) / 180,
    }));
  const obstacleIndex = new Map<string, PedestrianObstacle[]>();
  for (const o of obstacles) {
    const r = Math.hypot(...o.half) + STATIC_RADIUS;
    for (let x = Math.floor(o.center[0] - r); x <= o.center[0] + r; x++)
      for (let z = Math.floor(o.center[1] - r); z <= o.center[1] + r; z++) {
        const k = key(x, z),
          list = obstacleIndex.get(k) ?? [];
        list.push(o);
        obstacleIndex.set(k, list);
      }
  }
  const safe = (p: Point, crossing = false) => {
    if (!p.every(Number.isFinite)) return false;
    for (let x = Math.floor(p[0] - STATIC_RADIUS); x <= Math.floor(p[0] + STATIC_RADIUS); x++)
      for (let z = Math.floor(p[1] - STATIC_RADIUS); z <= Math.floor(p[1] + STATIC_RADIUS); z++) {
        const dx = Math.max(x - p[0], 0, p[0] - x - 1),
          dz = Math.max(z - p[1], 0, p[1] - z - 1);
        if (dx * dx + dz * dz >= STATIC_RADIUS ** 2 - 1e-10) continue;
        const k = key(x, z);
        if (
          x < 0 ||
          z < 0 ||
          x >= document.map.size ||
          z >= document.map.size ||
          !document.map.boundaryMask[z * document.map.size + x]
        )
          return false;
        if (!sidewalks.has(k) && !parks.has(k) && !(crossing && crossings.has(k))) return false;
      }
    for (const o of obstacleIndex.get(cellKey(p)) ?? []) {
      const dx = p[0] - o.center[0],
        dz = p[1] - o.center[1],
        c = Math.cos(o.yaw),
        s = Math.sin(o.yaw);
      const x = Math.max(0, Math.abs(dx * c + dz * s) - o.half[0]);
      const z = Math.max(0, Math.abs(-dx * s + dz * c) - o.half[1]);
      if (x * x + z * z < STATIC_RADIUS ** 2) return false;
    }
    return true;
  };
  const visible = (a: Point, b: Point, crossing = false) => {
    const steps = Math.max(1, Math.ceil(distance2(a, b) / 0.025));
    for (let i = 0; i <= steps; i++)
      if (!safe([a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps], crossing))
        return false;
    return true;
  };
  const network: PedestrianNetwork = {
    nodes: new Map(),
    edges: new Map(),
    outgoing: new Map(),
    sidewalks,
    crossings,
    parks,
    obstacles,
    blocked: [],
    safe,
    visible,
    height: (p) => {
      // A short ramp keeps the contact point continuous at the tile edge.
      const x = Math.floor(p[0]),
        z = Math.floor(p[1]);
      if (!sidewalks.has(key(x, z))) return parks.has(key(x, z)) ? -0.01 : 0.01;
      let height = 0.02;
      for (const [dx, dz] of cardinal) {
        const neighbor = key(x + dx, z + dz);
        if (sidewalks.has(neighbor)) continue;
        const margin = dx < 0 ? p[0] - x : dx > 0 ? x + 1 - p[0] : dz < 0 ? p[1] - z : z + 1 - p[1];
        const ground = parks.has(neighbor) ? -0.01 : 0.01;
        height = Math.min(height, ground + (0.02 - ground) * Math.min(1, margin / 0.15));
      }
      return height;
    },
  };
  const addNode = (id: string, point: Point, kind: PedestrianNode["kind"]) => {
    if (safe(point)) network.nodes.set(id, { id, point, kind, component: -1 });
  };
  const connect = (from: string, to: string, points?: Point[], crossing = false) => {
    const a = network.nodes.get(from),
      b = network.nodes.get(to);
    if (!a || !b || from === to) return;
    const path = points ?? [a.point, b.point];
    if (!path.slice(1).every((p, i) => visible(path[i] as Point, p, crossing))) return;
    const id = `${from}>${to}`;
    if (network.edges.has(id)) return;
    const edge = {
      id,
      from,
      to,
      points: path,
      length: path.slice(1).reduce((n, p, i) => n + distance2(path[i] as Point, p), 0),
      crossing,
      trafficSegments: [] as string[],
    };
    network.edges.set(id, edge);
    const list = network.outgoing.get(from) ?? [];
    list.push(edge);
    network.outgoing.set(from, list);
  };
  for (const k of [...sidewalks].sort()) {
    const [x = 0, z = 0] = k.split(",").map(Number);
    addNode(`s:${k}`, [x + 0.5, z + 0.5], "sidewalk");
  }
  for (const n of [...network.nodes.values()]) {
    const x = Math.floor(n.point[0]),
      z = Math.floor(n.point[1]);
    for (const [dx, dz] of cardinal) connect(n.id, `s:${key(x + dx, z + dz)}`);
    // Search crossing cells only; no carriageway goal or mid-crossing stop.
    const queue: { cell: Point; path: Point[] }[] = [{ cell: [x, z], path: [n.point] }];
    const visited = new Set([key(x, z)]);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (!current || current.path.length > 9) continue;
      for (const [dx, dz] of cardinal) {
        const p: Point = [current.cell[0] + dx, current.cell[1] + dz],
          k = key(...p);
        if (visited.has(k)) continue;
        visited.add(k);
        const path: Point[] = [...current.path, [p[0] + 0.5, p[1] + 0.5]];
        if (sidewalks.has(k)) {
          if (current.path.length > 1) connect(n.id, `s:${k}`, path, true);
        } else if (crossings.has(k)) queue.push({ cell: p, path });
      }
    }
  }
  for (const k of [...parks].sort()) {
    const [x = 0, z = 0] = k.split(",").map(Number);
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 10; j++)
        addNode(
          `p:${key(x * 10 + i, z * 10 + j)}`,
          [x + (i + 0.5) / 10, z + (j + 0.5) / 10],
          "park",
        );
  }
  for (const n of network.nodes.values())
    if (n.kind === "park") {
      const ix = Math.round(n.point[0] * 10 - 0.5),
        iz = Math.round(n.point[1] * 10 - 0.5);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          if (
            dx &&
            dz &&
            (!network.nodes.has(`p:${key(ix + dx, iz)}`) ||
              !network.nodes.has(`p:${key(ix, iz + dz)}`))
          )
            continue;
          connect(n.id, `p:${key(ix + dx, iz + dz)}`);
        }
      const x = Math.floor(n.point[0]),
        z = Math.floor(n.point[1]);
      for (const [dx, dz] of cardinal) {
        const id = `s:${key(x + dx, z + dz)}`;
        if (network.nodes.has(id)) {
          connect(n.id, id);
          connect(id, n.id);
        }
      }
    }
  let component = 0;
  for (const start of network.nodes.values()) {
    if (start.component >= 0) continue;
    const queue = [start];
    start.component = component;
    for (let i = 0; i < queue.length; i++)
      for (const e of network.outgoing.get(queue[i]?.id ?? "") ?? []) {
        const n = network.nodes.get(e.to);
        if (n && n.component < 0) {
          n.component = component;
          queue.push(n);
        }
      }
    if (!queue.some((n) => n.kind === "sidewalk"))
      for (const n of queue) network.blocked.push(n.point);
    component++;
  }
  const accessible = new Set(
    [...network.nodes.values()].filter((n) => n.kind === "sidewalk").map((n) => n.component),
  );
  for (const n of network.nodes.values())
    if (!accessible.has(n.component)) network.nodes.delete(n.id);
  for (const [id, e] of network.edges)
    if (!network.nodes.has(e.from) || !network.nodes.has(e.to)) network.edges.delete(id);
  for (const id of network.outgoing.keys()) if (!network.nodes.has(id)) network.outgoing.delete(id);
  for (const k of parks) {
    const [x = 0, z = 0] = k.split(",").map(Number);
    if (
      ![...Array(10).keys()].some((i) =>
        [...Array(10).keys()].some((j) => network.nodes.has(`p:${key(x * 10 + i, z * 10 + j)}`)),
      )
    )
      network.blocked.push([x + 0.5, z + 0.5]);
  }
  return network;
}

export function nearestPedestrianNode(
  network: PedestrianNetwork,
  point: Point,
  component?: number,
): PedestrianNode | undefined {
  let best: PedestrianNode | undefined,
    distance = Number.POSITIVE_INFINITY;
  for (const n of network.nodes.values()) {
    if (component !== undefined && n.component !== component) continue;
    const d = distance2(n.point, point);
    if (d < distance && network.visible(point, n.point)) {
      distance = d;
      best = n;
    }
  }
  return best;
}

/** SIM-023/026: diagnostic associations conservatively include whole vehicle bodies. */
export function associatePedestrianTraffic(
  network: PedestrianNetwork,
  drive: DriveNetwork,
  bodyRadius: number,
): void {
  const index = new Map<string, Set<string>>();
  for (const segment of drive.segments)
    for (const curve of segment.curves)
      for (const sample of curve.samples) {
        const radius = bodyRadius + NPC_RADIUS + 0.05;
        for (let x = Math.floor(sample.point[0] - radius); x <= sample.point[0] + radius; x++)
          for (let z = Math.floor(sample.point[1] - radius); z <= sample.point[1] + radius; z++) {
            const k = key(x, z),
              ids = index.get(k) ?? new Set<string>();
            ids.add(segment.id);
            index.set(k, ids);
          }
      }
  for (const edge of network.edges.values())
    if (edge.crossing) {
      const ids = new Set<string>();
      for (const point of edge.points)
        for (const id of index.get(cellKey(point)) ?? []) ids.add(id);
      edge.trafficSegments = [...ids].sort();
    }
}

/** A* with a binary heap, stable ties, and an optional crossing penalty. */
export function findPedestrianRoute(
  network: PedestrianNetwork,
  from: string,
  to: string,
  penalized = new Set<string>(),
): PedestrianEdge[] | undefined {
  const goal = network.nodes.get(to);
  if (!goal || !network.nodes.has(from)) return undefined;
  const heap: { id: string; f: number; g: number }[] = [];
  const compare = (a: (typeof heap)[number], b: (typeof heap)[number]) =>
    a.f - b.f || a.id.localeCompare(b.id);
  const push = (v: (typeof heap)[number]) => {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (compare(heap[p] as typeof v, v) <= 0) break;
      heap[i] = heap[p] as typeof v;
      i = p;
    }
    heap[i] = v;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop();
    if (heap.length && last) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && compare(heap[c + 1] as typeof last, heap[c] as typeof last) < 0)
          c++;
        if (compare(last, heap[c] as typeof last) <= 0) break;
        heap[i] = heap[c] as typeof last;
        i = c;
      }
      heap[i] = last;
    }
    return first;
  };
  const costs = new Map([[from, 0]]),
    parent = new Map<string, PedestrianEdge>();
  push({ id: from, f: 0, g: 0 });
  while (heap.length) {
    const current = pop();
    if (!current || current.g !== costs.get(current.id)) continue;
    if (current.id === to) {
      const route: PedestrianEdge[] = [];
      let id = to;
      while (id !== from) {
        const e = parent.get(id);
        if (!e) return undefined;
        route.push(e);
        id = e.from;
      }
      return route.reverse();
    }
    for (const e of network.outgoing.get(current.id) ?? []) {
      const n = network.nodes.get(e.to);
      if (!n) continue;
      const g = current.g + e.length + (penalized.has(e.id) ? 100 : 0);
      if (g >= (costs.get(e.to) ?? Number.POSITIVE_INFINITY)) continue;
      costs.set(e.to, g);
      parent.set(e.to, e);
      push({ id: e.to, g, f: g + distance2(n.point, goal.point) });
    }
  }
  return undefined;
}
