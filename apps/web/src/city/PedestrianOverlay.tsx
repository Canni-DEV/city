import { npcDiagnostics, type Point } from "@city/core";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three/webgpu";
import type { SimulationRuntime } from "./simulation-runtime";

export function PedestrianOverlay({
  runtime,
  selected,
}: {
  runtime: SimulationRuntime;
  selected: string | null;
}) {
  const drawing = useMemo(() => {
    const positions: number[] = [],
      colors: number[] = [],
      half = runtime.city.map.size / 2;
    const line = (a: Point, b: Point, color: string) => {
      positions.push(a[0] - half, 0.075, a[1] - half, b[0] - half, 0.075, b[1] - half);
      const c = new THREE.Color(color);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    };
    for (const e of runtime.network.edges.values()) {
      if (e.from.startsWith("p:") && e.to.startsWith("p:")) continue;
      const color =
        e.id === selected
          ? "#caff72"
          : e.crossing
            ? "#ff8cd0"
            : e.from.startsWith("p:") || e.to.startsWith("p:")
              ? "#ffc565"
              : "#48caff";
      e.points.slice(1).forEach((p, i) => {
        line(e.points[i] as Point, p, color);
      });
      const a = e.points[0],
        b = e.points[1];
      if (a && b) {
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]),
          dx = (b[0] - a[0]) / d,
          dz = (b[1] - a[1]) / d;
        const tip: Point = [a[0] + dx * 0.3, a[1] + dz * 0.3];
        line(tip, [tip[0] - dx * 0.1 + dz * 0.04, tip[1] - dz * 0.1 - dx * 0.04], color);
        if (e.crossing) line([a[0] - 0.12, a[1]], [a[0] + 0.12, a[1]], color);
      }
    }
    for (const n of runtime.network.nodes.values())
      if (n.kind === "park")
        line([n.point[0] - 0.025, n.point[1]], [n.point[0] + 0.025, n.point[1]], "#70c88d");
    for (const p of runtime.network.blocked)
      line([p[0] - 0.04, p[1]], [p[0] + 0.04, p[1]], "#ff5555");
    for (const o of runtime.network.obstacles) {
      const corners: Point[] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x = 0, z = 0]) => [
        o.center[0] + x * o.half[0] * Math.cos(o.yaw) - z * o.half[1] * Math.sin(o.yaw),
        o.center[1] + x * o.half[0] * Math.sin(o.yaw) + z * o.half[1] * Math.cos(o.yaw),
      ]);
      corners.forEach((p, i) => {
        line(p, corners[(i + 1) % 4] as Point, "#889499");
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false });
    return new THREE.LineSegments(geometry, material);
  }, [runtime, selected]);
  const dynamic = useMemo(
    () =>
      new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: "#caff72", depthTest: false }),
      ),
    [],
  );
  useEffect(
    () => () => {
      drawing.geometry.dispose();
      drawing.material.dispose();
    },
    [drawing],
  );
  useEffect(
    () => () => {
      dynamic.geometry.dispose();
      dynamic.material.dispose();
    },
    [dynamic],
  );
  useFrame(() => {
    const npc = selected ? npcDiagnostics(runtime.world, selected)[0] : undefined,
      positions: number[] = [],
      half = runtime.city.map.size / 2;
    const line = (a: Point, b: Point) =>
      positions.push(a[0] - half, 0.09, a[1] - half, b[0] - half, 0.09, b[1] - half);
    if (npc) {
      npc.route.slice(1).forEach((p, i) => {
        line(npc.route[i] as Point, p);
      });
      for (const id of [npc.id, ...npc.neighbors]) {
        const p = runtime.display.get(id);
        if (!p) continue;
        for (let i = 0; i < 24; i++)
          line(
            [
              p.x + Math.cos((i / 24) * Math.PI * 2) * npc.radius,
              p.z + Math.sin((i / 24) * Math.PI * 2) * npc.radius,
            ],
            [
              p.x + Math.cos(((i + 1) / 24) * Math.PI * 2) * npc.radius,
              p.z + Math.sin(((i + 1) / 24) * Math.PI * 2) * npc.radius,
            ],
          );
      }
    }
    dynamic.geometry.dispose();
    dynamic.geometry = new THREE.BufferGeometry();
    dynamic.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  });
  return (
    <>
      <primitive object={drawing} />
      <primitive object={dynamic} />
    </>
  );
}
