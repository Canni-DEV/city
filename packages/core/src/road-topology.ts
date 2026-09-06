import type { CityDocumentV1 } from "./domain.js";
import {
  DRIVE_LANE_OFFSET,
  type DriveAsset,
  type RoadPort,
  type RoadTopology,
  required,
} from "./drive-contracts.js";
import { transformRoadPoint } from "./drive-geometry.js";
import {
  type Cardinal,
  DIRECTION_DELTA,
  isAvenueClass,
  OPPOSITE_CARDINAL,
  occupiedCellsForRoadTile,
  type Point,
  pairLaneMates,
  parsePointKey,
  pointKey,
  roadFootprint,
  rotateConnector,
  turningDualOrigins,
} from "./road-tiles.js";

const portKey = (p: Point) => p.map((v) => v.toFixed(5)).join(",");
const oneWay = (cell: Point, mate: Point): Cardinal =>
  mate[0] > cell[0] ? "south" : mate[0] < cell[0] ? "north" : mate[1] > cell[1] ? "west" : "east";

/** GEN-029: called once after tile resolution, never inferred by a moving vehicle. */
export function resolveRoadTopology(
  document: CityDocumentV1,
  assets: readonly DriveAsset[],
): RoadTopology {
  const catalog = new Map(assets.map((a) => [a.id, a]));
  const classes = new Map(
    document.roadGraph.cells.flatMap((tile) =>
      occupiedCellsForRoadTile(tile).map((p) => [pointKey(p), tile.roadClass ?? "local"] as const),
    ),
  );
  const mates = pairLaneMates(classes);
  const topology: RoadTopology = {
    version: 1,
    sections: [],
    ports: [],
    movements: [],
    lanePairs: [...mates].filter(([a, b]) => a < b).sort(([a], [b]) => a.localeCompare(b)),
    portals: [],
  };
  const portGroups = new Map<string, RoadPort[]>();
  const headingBySection = new Map<string, Cardinal>();
  for (const tile of [...document.roadGraph.cells].sort((a, b) => a.id.localeCompare(b.id))) {
    const profile = catalog.get(tile.assetId)?.driveProfile;
    if (!profile) throw new Error(`SIM-017 missing drive profile: ${tile.assetId}`);
    const id = `section:${tile.id}`;
    const kind = tile.assetId.includes("roundabout")
      ? "roundabout"
      : tile.assetId.includes("curve")
        ? "curve"
        : profile.ports.length > 2
          ? "junction"
          : profile.ports.length === 1
            ? "terminal"
            : "street";
    topology.sections.push({ id, tileIds: [tile.id], kind, roadClass: tile.roadClass ?? "local" });
    const mate = mates.get(pointKey(tile.position));
    if (
      mate &&
      isAvenueClass(tile.roadClass) &&
      kind === "street" &&
      tile.assetId.includes("straight")
    )
      headingBySection.set(id, oneWay(tile.position, parsePointKey(mate)));
    for (const [index, p] of profile.ports.entries()) {
      const position = transformRoadPoint(
        p.position,
        tile.position,
        tile.rotation,
        roadFootprint(tile.assetId).width,
      );
      const direction = rotateConnector(p.direction, tile.rotation);
      const port: RoadPort = {
        id: `port:${tile.id}:${index}`,
        sectionId: id,
        position,
        direction,
        inbound: true,
        outbound: true,
        offset: DRIVE_LANE_OFFSET,
        peerId: null,
      };
      topology.ports.push(port);
      const group = portGroups.get(portKey(position)) ?? [];
      group.push(port);
      portGroups.set(portKey(position), group);
    }
  }
  const headingByPort = new Map(
    topology.ports.map((p) => [p.id, headingBySection.get(p.sectionId)]),
  );
  for (const group of portGroups.values())
    for (const port of group) {
      const peer = group.find(
        (p) => p !== port && p.direction === OPPOSITE_CARDINAL[port.direction],
      );
      if (!peer) continue;
      port.peerId = peer.id;
      const heading = headingBySection.get(port.sectionId) ?? headingBySection.get(peer.sectionId);
      if (
        heading &&
        (port.direction === heading || port.direction === OPPOSITE_CARDINAL[heading])
      ) {
        port.inbound = port.direction !== heading;
        port.outbound = port.direction === heading;
        port.offset = 0;
      }
    }
  // GEN-029: a dual nudo is one junction, including its internal tile seams.
  for (const origin of turningDualOrigins(new Set(classes.keys()), classes, document.map.size)) {
    const tileIds = new Set(
      document.roadGraph.cells
        .filter(
          (t) =>
            t.position[0] >= origin[0] &&
            t.position[0] <= origin[0] + 1 &&
            t.position[1] >= origin[1] &&
            t.position[1] <= origin[1] + 1,
        )
        .map((t) => t.id),
    );
    const group = topology.sections.filter((s) => s.tileIds.some((id) => tileIds.has(id)));
    if (group.length < 2) continue;
    const ids = new Set(group.map((s) => s.id)),
      id = required([...ids].sort()[0], "merged junction");
    const section = {
      id,
      tileIds: group.flatMap((s) => s.tileIds).sort(),
      kind: "junction" as const,
      roadClass: "arterial" as const,
    };
    topology.sections = topology.sections.filter((s) => !ids.has(s.id));
    topology.sections.push(section);
    const internal = new Set(
      topology.ports
        .filter(
          (p) =>
            ids.has(p.sectionId) &&
            p.peerId &&
            topology.ports.some((q) => q.id === p.peerId && ids.has(q.sectionId)),
        )
        .map((p) => p.id),
    );
    topology.ports = topology.ports.filter((p) => !internal.has(p.id));
    for (const p of topology.ports) if (ids.has(p.sectionId)) p.sectionId = id;
  }
  const complex = (id: string) => {
    const s = required(
      topology.sections.find((section) => section.id === id),
      id,
    );
    return (
      s.kind !== "roundabout" &&
      s.kind !== "curve" &&
      s.kind !== "terminal" &&
      !s.tileIds.some((id) =>
        required(
          document.roadGraph.cells.find((t) => t.id === id),
          id,
        ).assetId.includes("straight"),
      )
    );
  };
  for (const p of [...topology.ports]) {
    const peer = topology.ports.find((q) => q.id === p.peerId);
    if (
      !peer ||
      p.sectionId === peer.sectionId ||
      !complex(p.sectionId) ||
      !complex(peer.sectionId)
    )
      continue;
    const group = topology.sections.filter((s) => s.id === p.sectionId || s.id === peer.sectionId),
      ids = new Set(group.map((s) => s.id)),
      id = required([...ids].sort()[0], "merged junction");
    topology.sections = topology.sections.filter((s) => !ids.has(s.id));
    topology.sections.push({
      id,
      tileIds: group.flatMap((s) => s.tileIds).sort(),
      kind: "junction",
      roadClass: group.some((s) => s.roadClass !== "local") ? "arterial" : "local",
    });
    for (const q of topology.ports) if (ids.has(q.sectionId)) q.sectionId = id;
  }
  const internal = new Set(
    topology.ports
      .filter(
        (p) =>
          p.peerId && topology.ports.some((q) => q.id === p.peerId && q.sectionId === p.sectionId),
      )
      .map((p) => p.id),
  );
  topology.ports = topology.ports.filter((p) => !internal.has(p.id));
  topology.sections.sort((a, b) => a.id.localeCompare(b.id));
  // Reserve approach distance for steering before a curved/junction tile starts.
  const sectionById = new Map(topology.sections.map((s) => [s.id, s]));
  const byId = new Map(topology.ports.map((p) => [p.id, p]));
  const straight = (id: string) => {
    const section = required(sectionById.get(id), id);
    return (
      section.kind === "street" &&
      required(
        document.roadGraph.cells.find((t) => t.id === section.tileIds[0]),
        section.tileIds[0] ?? id,
      ).assetId.includes("straight")
    );
  };
  for (const p of topology.ports) {
    const peer = p.peerId ? byId.get(p.peerId) : undefined;
    if (!peer || p.id > peer.id || straight(p.sectionId) === straight(peer.sectionId)) continue;
    const curve = straight(p.sectionId) ? peer : p,
      d = DIRECTION_DELTA[curve.direction];
    const shifted: Point = [p.position[0] + d[0] * 0.35, p.position[1] + d[1] * 0.35];
    p.position = [...shifted];
    peer.position = [...shifted];
  }
  // External gates terminate inside the final tile, so the whole body remains on the map.
  const handledExternal = new Set<string>();
  for (const gate of document.roadGraph.nodes.filter((n) => n.kind === "gate")) {
    const covered = document.roadGraph.cells.filter((tile) =>
      occupiedCellsForRoadTile(tile).some(
        (p) =>
          pointKey(p) === pointKey(gate.position) ||
          pointKey(p) === mates.get(pointKey(gate.position)),
      ),
    );
    const portIds: string[] = [];
    for (const tile of covered) {
      const section = required(
        topology.sections.find((s) => s.tileIds.includes(tile.id)),
        tile.id,
      );
      const ports = topology.ports.filter((p) => p.sectionId === section.id);
      const disconnected = ports.filter((p) => !p.peerId && !handledExternal.has(p.id));
      if (disconnected.length) {
        for (const p of disconnected) {
          handledExternal.add(p.id);
          const d = DIRECTION_DELTA[p.direction];
          p.position = [p.position[0] - d[0] * 0.37, p.position[1] - d[1] * 0.37];
          const heading = headingByPort.get(p.id);
          if (heading) {
            p.inbound = p.direction !== heading;
            p.outbound = p.direction === heading;
            p.offset = 0;
          }
        }
        portIds.push(...disconnected.map((p) => p.id));
        continue;
      }
      if (ports.length !== 1) continue;
      const inside = required(ports[0], tile.id),
        direction = OPPOSITE_CARDINAL[inside.direction],
        delta = DIRECTION_DELTA[direction];
      const port: RoadPort = {
        id: `portal-port:${tile.id}`,
        sectionId: section.id,
        position: [
          tile.position[0] + 0.5 + delta[0] * 0.1,
          tile.position[1] + 0.5 + delta[1] * 0.1,
        ],
        direction,
        inbound: true,
        outbound: true,
        offset: DRIVE_LANE_OFFSET,
        peerId: null,
      };
      topology.ports.push(port);
      portIds.push(port.id);
    }
    if (portIds.length)
      topology.portals.push({ id: `portal:${gate.id}`, gateId: gate.id, portIds });
  }
  // A widened gate can touch more than its original two raster cells.
  const assigned = new Set(topology.portals.flatMap((p) => p.portIds));
  const gates = document.roadGraph.nodes.filter((n) => n.kind === "gate");
  for (const p of topology.ports.filter((p) => !p.peerId && !assigned.has(p.id))) {
    const [x, z] = p.position,
      size = document.map.size;
    if (x !== 0 && z !== 0 && x !== size && z !== size) continue;
    const gate = [...gates].sort(
      (a, b) =>
        Math.hypot(a.position[0] - x, a.position[1] - z) -
          Math.hypot(b.position[0] - x, b.position[1] - z) || a.id.localeCompare(b.id),
    )[0];
    if (!gate) continue;
    let portal = topology.portals.find((q) => q.gateId === gate.id);
    if (!portal) {
      portal = { id: `portal:${gate.id}`, gateId: gate.id, portIds: [] };
      topology.portals.push(portal);
    }
    portal.portIds.push(p.id);
    const d = DIRECTION_DELTA[p.direction];
    p.position = [x - d[0] * 0.37, z - d[1] * 0.37];
    const heading = headingByPort.get(p.id);
    if (heading) {
      p.inbound = p.direction !== heading;
      p.outbound = p.direction === heading;
      p.offset = 0;
    }
  }
  for (const section of topology.sections) {
    const ports = topology.ports.filter((p) => p.sectionId === section.id);
    const external = ports.find(
      (p) => !p.peerId && topology.portals.some((q) => q.portIds.includes(p.id)),
    );
    if (external && ports.length === 2 && headingBySection.has(section.id)) {
      const interior = required(
        ports.find((p) => p !== external),
        section.id,
      );
      interior.inbound = external.outbound;
      interior.outbound = external.inbound;
      interior.offset = external.offset;
      const peer = topology.ports.find((p) => p.id === interior.peerId);
      if (peer) {
        peer.inbound = interior.outbound;
        peer.outbound = interior.inbound;
        peer.offset = interior.offset;
      }
    }
  }
  for (const section of topology.sections) {
    const ports = topology.ports.filter((p) => p.sectionId === section.id);
    const terminal = new Set(ports.map((p) => p.direction)).size === 1;
    if (terminal) section.kind = "terminal";
    for (const from of ports.filter((p) => p.inbound))
      for (const to of ports.filter((p) => p.outbound)) {
        if (from.direction === to.direction && !terminal) continue;
        topology.movements.push({
          id: `movement:${from.id}>${to.id}`,
          sectionId: section.id,
          from: from.id,
          to: to.id,
        });
      }
  }
  return topology;
}

export function lanePortPosition(port: RoadPort, inbound: boolean): Point {
  const d = DIRECTION_DELTA[port.direction],
    sign = inbound ? -1 : 1;
  return [
    port.position[0] - d[1] * port.offset * sign,
    port.position[1] + d[0] * port.offset * sign,
  ];
}
