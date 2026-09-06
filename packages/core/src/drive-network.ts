import type { CityDocumentV1 } from "./domain.js";
import {
  type DriveAsset,
  type RoadTopology,
  required,
  type VehicleBounds,
} from "./drive-contracts.js";
import {
  type Cubic,
  createDriveCurve,
  type DriveCurve,
  pointDistance,
  sampleDriveCurve,
} from "./drive-geometry.js";
import { buildDriveSurface, createCurveValidator, type DriveSurface } from "./drive-surface.js";
import { createJunctionRouter } from "./junction-route.js";
import { DIRECTION_DELTA, type Point } from "./road-tiles.js";
import { lanePortPosition } from "./road-topology.js";
import { crossingCellSet } from "./sidewalks.js";

export interface DriveNetworkIssue {
  code: string;
  sectionId: string;
  segmentId?: string;
  position: Point;
  message: string;
}
export interface DriveNetworkValidation {
  valid: boolean;
  issues: DriveNetworkIssue[];
}
export interface DriveSegment {
  id: string;
  sectionId: string;
  kind: "lane" | "turn" | "return" | "ring" | "join";
  from: string;
  to: string;
  curves: DriveCurve[];
  length: number;
  successors: string[];
  crossingIds: string[];
}
export interface DriveNetwork {
  topology: RoadTopology;
  segments: DriveSegment[];
  byId: ReadonlyMap<string, DriveSegment>;
  surface: DriveSurface;
  validation: DriveNetworkValidation;
  entrances: string[];
  exits: ReadonlySet<string>;
  crossingZones: { id: string; cell: Point; segmentIds: string[] }[];
}
const add = (p: Point, d: Point, n: number): Point => [p[0] + d[0] * n, p[1] + d[1] * n];
const negate = (p: Point): Point => [-p[0], -p[1]];

export function buildDriveNetwork(
  document: CityDocumentV1,
  assets: readonly DriveAsset[],
): DriveNetwork {
  const topology = document.roadGraph.topology;
  if (!topology) throw new Error("SIM-017: generate a city with resolved road topology");
  const surface = buildDriveSurface(document, assets);
  const ports = new Map(topology.ports.map((p) => [p.id, p]));
  const sections = new Map(topology.sections.map((s) => [s.id, s]));
  const portalPorts = new Set(topology.portals.flatMap((p) => p.portIds));
  const bodies = assets.flatMap((a) =>
    a.vehicleBounds
      ? [
          {
            min: a.vehicleBounds.min.map((n) => n * (a.uniformScale ?? 1)) as Point,
            max: a.vehicleBounds.max.map((n) => n * (a.uniformScale ?? 1)) as Point,
          },
        ]
      : [],
  );
  // One envelope contains every catalog body, including asymmetric pivots.
  const body: VehicleBounds = {
    min: [Math.min(...bodies.map((b) => b.min[0])), Math.min(...bodies.map((b) => b.min[1]))],
    max: [Math.max(...bodies.map((b) => b.max[0])), Math.max(...bodies.map((b) => b.max[1]))],
  };
  if (!bodies.length) throw new Error("SIM-017: missing catalog vehicle bounds");
  const issues: DriveNetworkIssue[] = [];
  const segments: DriveSegment[] = [];
  const fitted = new Map<string, Cubic[]>();
  const validateCurve = createCurveValidator(document, body, surface),
    curveValidity = new WeakMap<Cubic, boolean>();
  const fits = (c: Cubic) => {
    const cached = curveValidity.get(c);
    if (cached !== undefined) return cached;
    const valid = validateCurve(c);
    curveValidity.set(c, valid);
    return valid;
  };
  const routers = new Map<string, ReturnType<typeof createJunctionRouter>>();
  const addSegment = (
    id: string,
    sectionId: string,
    kind: DriveSegment["kind"],
    from: string,
    to: string,
    controls: Cubic[],
  ) => {
    const curves = controls.map(createDriveCurve);
    const segment: DriveSegment = {
      id,
      sectionId,
      kind,
      from,
      to,
      curves,
      length: curves.reduce((s, c) => s + c.length, 0),
      successors: [],
      crossingIds: [],
    };
    if (!curves.length || segment.length < 1e-6)
      issues.push({
        code: "ZERO_LENGTH",
        sectionId,
        segmentId: id,
        position: controls[0]?.[0] ?? [0, 0],
        message: "Movement has no travel length",
      });
    if (controls.some((c) => !fits(c)))
      issues.push({
        code: "BODY_OUTSIDE_CALZADA",
        sectionId,
        segmentId: id,
        position: required(controls[0], id)[0],
        message: "Swept catalog body leaves the measured carriageway",
      });
    segments.push(segment);
  };
  const fit = (a: Point, b: Point, ta: Point, tb: Point): Cubic[] => {
    const key = JSON.stringify([a, b, ta, tb]);
    const cached = fitted.get(key);
    if (cached) return cached;
    const length = pointDistance(a, b);
    let chosen: Cubic = [a, add(a, ta, length / 3), add(b, tb, -length / 3), b];
    for (const scale of [0.39, 0.3, 0.2, 0.48, 0.55, 0.65, 0.12, 0.8]) {
      const c: Cubic = [a, add(a, ta, length * scale), add(b, tb, -length * scale), b];
      if (fits(c)) {
        chosen = c;
        break;
      }
    }
    const result = [chosen];
    fitted.set(key, result);
    return result;
  };
  // A roundabout has one shared CCW ring, not an independent spline per destination.
  for (const section of topology.sections.filter((s) => s.kind === "roundabout")) {
    const tile = required(
      document.roadGraph.cells.find((t) => section.tileIds.includes(t.id)),
      section.id,
    );
    const center: Point = [tile.position[0] + 1.5, tile.position[1] + 1.5];
    const ps = topology.ports.filter((p) => p.sectionId === section.id);
    const ringPoints = ps
      .flatMap((p) => {
        const d = DIRECTION_DELTA[p.direction],
          angle = (Math.atan2(d[0], d[1]) + Math.PI * 2) % (Math.PI * 2);
        return [
          {
            id: `${p.id}:exit`,
            angle: (angle - 0.4 + Math.PI * 2) % (Math.PI * 2),
            port: p,
            entry: false,
          },
          { id: `${p.id}:entry`, angle: (angle + 0.4) % (Math.PI * 2), port: p, entry: true },
        ];
      })
      .sort((a, b) => a.angle - b.angle);
    const radius = 0.8;
    const pos = (angle: number): Point => [
      center[0] + Math.sin(angle) * radius,
      center[1] + Math.cos(angle) * radius,
    ];
    const tangent = (angle: number): Point => [Math.cos(angle), -Math.sin(angle)];
    for (const [i, r] of ringPoints.entries()) {
      const next = required(ringPoints[(i + 1) % ringPoints.length], "roundabout ring");
      const sweep = (next.angle - r.angle + Math.PI * 2) % (Math.PI * 2),
        h = (4 / 3) * Math.tan(sweep / 4) * radius;
      addSegment(`ring:${r.id}`, section.id, "ring", r.id, next.id, [
        [
          pos(r.angle),
          add(pos(r.angle), tangent(r.angle), h),
          add(pos(next.angle), tangent(next.angle), -h),
          pos(next.angle),
        ],
      ]);
      if (r.entry && r.port.inbound)
        addSegment(
          `join:${r.id}`,
          section.id,
          "join",
          r.port.id,
          r.id,
          fit(
            lanePortPosition(r.port, true),
            pos(r.angle),
            negate(DIRECTION_DELTA[r.port.direction]),
            tangent(r.angle),
          ),
        );
      if (!r.entry && r.port.outbound)
        addSegment(
          `leave:${r.id}`,
          section.id,
          "join",
          r.id,
          r.port.id,
          fit(
            pos(r.angle),
            lanePortPosition(r.port, false),
            tangent(r.angle),
            DIRECTION_DELTA[r.port.direction],
          ),
        );
    }
  }
  for (const movement of topology.movements) {
    const section = required(sections.get(movement.sectionId), movement.sectionId);
    if (section.kind === "roundabout") continue;
    const from = required(ports.get(movement.from), movement.from),
      to = required(ports.get(movement.to), movement.to);
    const a = lanePortPosition(from, true),
      b = lanePortPosition(to, false),
      ta = negate(DIRECTION_DELTA[from.direction]),
      tb = DIRECTION_DELTA[to.direction];
    let controls: Cubic[];
    if (from === to) {
      const center = add(from.position, ta, 0.5),
        side: Point = [-ta[1], ta[0]],
        middle = add(center, ta, 0.16);
      controls = [...fit(a, middle, ta, side), ...fit(middle, b, side, tb)];
    } else {
      controls = fit(a, b, ta, tb);
      if (controls.some((c) => !fits(c))) {
        let router = routers.get(section.id);
        if (!router) {
          router = createJunctionRouter(
            document.roadGraph.cells
              .filter((t) => section.tileIds.includes(t.id))
              .map((t) => t.position),
            body,
            surface,
            fits,
          );
          routers.set(section.id, router);
        }
        let routed = router({ point: a, tangent: ta }, { point: b, tangent: tb });
        if (!routed) {
          const key = `${section.id}:dense`;
          let dense = routers.get(key);
          if (!dense) {
            dense = createJunctionRouter(
              document.roadGraph.cells
                .filter((t) => section.tileIds.includes(t.id))
                .map((t) => t.position),
              body,
              surface,
              fits,
              true,
            );
            routers.set(key, dense);
          }
          routed = dense({ point: a, tangent: ta }, { point: b, tangent: tb });
        }
        controls = routed ?? controls;
      }
    }
    addSegment(
      movement.id,
      section.id,
      from === to ? "return" : ta[0] === tb[0] && ta[1] === tb[1] ? "lane" : "turn",
      from.id,
      to.id,
      controls,
    );
  }
  const byFrom = new Map<string, DriveSegment[]>();
  for (const s of segments) {
    const list = byFrom.get(s.from) ?? [];
    list.push(s);
    byFrom.set(s.from, list);
  }
  const exits = new Set<string>(),
    entrances: string[] = [];
  for (const segment of segments) {
    const port = ports.get(segment.to);
    const next = port ? port.peerId : segment.to;
    segment.successors = (next ? (byFrom.get(next) ?? []) : []).map((s) => s.id).sort();
    if (portalPorts.has(segment.to)) exits.add(segment.id);
    if (portalPorts.has(segment.from)) entrances.push(segment.id);
    if (!segment.successors.length && !exits.has(segment.id))
      issues.push({
        code: "TRAPPED_LANE",
        sectionId: segment.sectionId,
        segmentId: segment.id,
        position: required(segment.curves.at(-1), segment.id).controls[3],
        message: "Lane has no continuation or external exit",
      });
  }
  for (const p of topology.ports)
    if (!p.peerId && !portalPorts.has(p.id))
      issues.push({
        code: "UNCONNECTED_PORT",
        sectionId: p.sectionId,
        position: p.position,
        message: `No matching road connector for ${p.id}`,
      });
  const crossingZones = [...crossingCellSet(document)].sort().map((key) => ({
    id: `crossing:${key}`,
    cell: key.split(",").map(Number) as Point,
    segmentIds: [] as string[],
  }));
  const crossingByCell = new Map(crossingZones.map((z) => [z.cell.join(","), z]));
  for (const s of segments)
    for (const c of s.curves)
      for (const sample of c.samples) {
        const zone = crossingByCell.get(
          `${Math.floor(sample.point[0])},${Math.floor(sample.point[1])}`,
        );
        if (zone && !s.crossingIds.includes(zone.id)) {
          s.crossingIds.push(zone.id);
          zone.segmentIds.push(s.id);
        }
      }
  return {
    topology,
    segments,
    byId: new Map(segments.map((s) => [s.id, s])),
    surface,
    validation: { valid: issues.length === 0, issues },
    entrances: entrances.sort(),
    exits,
    crossingZones: crossingZones.filter((z) => z.segmentIds.length),
  };
}

export function sampleDriveSegment(segment: DriveSegment, distance: number) {
  let remaining = Math.max(0, Math.min(distance, segment.length));
  for (const curve of segment.curves) {
    if (remaining <= curve.length) return sampleDriveCurve(curve, remaining);
    remaining -= curve.length;
  }
  const last = required(segment.curves.at(-1), segment.id);
  return sampleDriveCurve(last, last.length);
}

/** SIM-013: Dijkstra is A* with an admissible zero heuristic, weighted by travel length. */
export function findNetworkPath(
  network: DriveNetwork,
  start: string,
  goal: string,
): string[] | undefined {
  if (!network.byId.has(start) || !network.byId.has(goal)) return;
  const cost = new Map([[start, 0]]),
    parent = new Map<string, string>(),
    open = [start];
  while (open.length) {
    open.sort((a, b) => required(cost.get(a), a) - required(cost.get(b), b) || a.localeCompare(b));
    const current = open.shift();
    if (current === undefined) break;
    if (current === goal) {
      const path = [goal];
      let c = goal;
      while (parent.has(c)) {
        c = required(parent.get(c), c);
        path.unshift(c);
      }
      return path;
    }
    const currentSegment = required(network.byId.get(current), current);
    for (const id of currentSegment.successors) {
      const next = required(cost.get(current), current) + required(network.byId.get(id), id).length;
      if (next >= (cost.get(id) ?? Infinity)) continue;
      cost.set(id, next);
      parent.set(id, current);
      if (!open.includes(id)) open.push(id);
    }
  }
  return;
}
