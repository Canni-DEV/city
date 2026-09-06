import { type DriveNetwork, sampleDriveSegment } from "@city/core";
import { useEffect, useMemo } from "react";
import * as THREE from "three/webgpu";

export function TrafficOverlay({
  network,
  half,
  selected,
  onSelect,
}: {
  network: DriveNetwork;
  half: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const drawing = useMemo(() => {
    const positions: number[] = [],
      colors: number[] = [],
      ids: (string | null)[] = [];
    const selectedSegment = selected ? network.byId.get(selected) : undefined;
    const related = new Set([selected, ...(selectedSegment?.successors ?? [])]);
    const invalid = new Set(network.validation.issues.map((i) => i.segmentId));
    const line = (a: number[], b: number[], color: string, id: string | null) => {
      positions.push(a[0]! - half, 0.065, a[1]! - half, b[0]! - half, 0.065, b[1]! - half);
      const c = new THREE.Color(color);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      ids.push(id);
    };
    for (const [a, b] of network.surface.boundaries) line(a, b, "#788c91", null);
    for (const s of network.segments) {
      const color = related.has(s.id)
        ? "#caff72"
        : invalid.has(s.id)
          ? "#ff5555"
          : s.kind === "lane"
            ? "#48e1ff"
            : s.kind === "ring"
              ? "#c8a5ff"
              : "#ffcc65";
      const count = Math.max(2, Math.ceil(s.length / 0.06));
      for (let i = 0; i < count; i++) {
        if (s.kind !== "lane" && s.kind !== "ring" && i % 4 === 3) continue;
        const a = sampleDriveSegment(s, (s.length * i) / count),
          b = sampleDriveSegment(s, (s.length * (i + 1)) / count);
        line([a.x, a.z], [b.x, b.z], color, s.id);
      }
      for (let d = s.length / 2; d < s.length; d += 1) {
        const p = sampleDriveSegment(s, d),
          fx = Math.sin(p.yaw),
          fz = Math.cos(p.yaw);
        line(
          [p.x, p.z],
          [p.x - fx * 0.12 + fz * 0.055, p.z - fz * 0.12 - fx * 0.055],
          "#ffffff",
          s.id,
        );
        line(
          [p.x, p.z],
          [p.x - fx * 0.12 - fz * 0.055, p.z - fz * 0.12 + fx * 0.055],
          "#ffffff",
          s.id,
        );
      }
    }
    for (const zone of network.crossingZones) {
      const [x, z] = zone.cell;
      line([x + 0.2, z + 0.2], [x + 0.8, z + 0.8], "#ff8cd0", null);
      line([x + 0.8, z + 0.2], [x + 0.2, z + 0.8], "#ff8cd0", null);
    }
    for (const portal of network.topology.portals)
      for (const id of portal.portIds) {
        const p = network.topology.ports.find((p) => p.id === id)!;
        line(
          [p.position[0] - 0.15, p.position[1]],
          [p.position[0] + 0.15, p.position[1]],
          "#caff72",
          null,
        );
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return { geometry, ids };
  }, [network, half, selected]);
  useEffect(() => () => drawing.geometry.dispose(), [drawing]);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Three.js object; the paired HTML inspector provides keyboard selection.
    <lineSegments
      geometry={drawing.geometry}
      onClick={(e) => {
        const id = drawing.ids[Math.floor((e.index ?? 0) / 2)];
        if (id) {
          e.stopPropagation();
          onSelect(id);
        }
      }}
    >
      <lineBasicMaterial vertexColors toneMapped={false} />
    </lineSegments>
  );
}
