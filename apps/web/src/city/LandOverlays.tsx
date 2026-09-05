import { type CityDocumentV1, ZONE_TYPES, type ZoneType } from "@city/core";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three/webgpu";

export type OverlayOptions = { zones: boolean; lots: boolean; grid: boolean };
const COLORS: Record<ZoneType, string> = {
  suburban: "#f1cf80",
  urban: "#93b8f0",
  commercial: "#e8a5c6",
  industrial: "#dca278",
  park: "#91c79e",
};

function patternTexture(zone: ZoneType) {
  const canvas = window.document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create the zone pattern.");
  context.fillStyle = COLORS[zone];
  context.fillRect(0, 0, 32, 32);
  context.strokeStyle = "#26352f";
  context.fillStyle = "#26352f";
  context.lineWidth = 2;
  context.beginPath();
  if (zone === "suburban") {
    context.arc(16, 16, 3, 0, Math.PI * 2);
    context.fill();
  } else if (zone === "urban") {
    context.moveTo(16, 0);
    context.lineTo(16, 32);
  } else if (zone === "commercial") {
    context.moveTo(0, 16);
    context.lineTo(32, 16);
  } else if (zone === "industrial") {
    context.moveTo(0, 32);
    context.lineTo(32, 0);
  } else {
    context.moveTo(10, 16);
    context.lineTo(22, 16);
    context.moveTo(16, 10);
    context.lineTo(16, 22);
  }
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function ZoneCells({ city, zone }: { city: CityDocumentV1; zone: ZoneType }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(
    () => city.blocks.filter((block) => block.zone === zone).flatMap((block) => block.cells),
    [city, zone],
  );
  const texture = useMemo(() => patternTexture(zone), [zone]);
  useEffect(() => () => texture.dispose(), [texture]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    cells.forEach(([x, y], index) => {
      matrix.makeRotationX(-Math.PI / 2);
      matrix.setPosition(x - city.map.size / 2 + 0.5, 0.005, y - city.map.size / 2 + 0.5);
      mesh.current?.setMatrixAt(index, matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [city, cells]);
  if (!cells.length) return null;
  return (
    <instancedMesh key={cells.length} ref={mesh} args={[undefined, undefined, cells.length]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent opacity={0.92} depthWrite={false} />
    </instancedMesh>
  );
}

function LotLines({ city }: { city: CityDocumentV1 }) {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    const half = city.map.size / 2;
    for (const lot of city.lots) {
      const minX = Math.min(...lot.cells.map(([x]) => x)) - half;
      const maxX = Math.max(...lot.cells.map(([x]) => x)) - half + 1;
      const minY = Math.min(...lot.cells.map(([, y]) => y)) - half;
      const maxY = Math.max(...lot.cells.map(([, y]) => y)) - half + 1;
      vertices.push(
        minX,
        0.045,
        minY,
        maxX,
        0.045,
        minY,
        maxX,
        0.045,
        minY,
        maxX,
        0.045,
        maxY,
        maxX,
        0.045,
        maxY,
        minX,
        0.045,
        maxY,
        minX,
        0.045,
        maxY,
        minX,
        0.045,
        minY,
      );
    }
    return new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
  }, [city]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffffff" />
    </lineSegments>
  );
}

function GridLines({ city }: { city: CityDocumentV1 }) {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    const half = city.map.size / 2;
    for (let index = 0; index <= city.map.size; index += 1) {
      const offset = index - half;
      vertices.push(
        -half,
        0.055,
        offset,
        half,
        0.055,
        offset,
        offset,
        0.055,
        -half,
        offset,
        0.055,
        half,
      );
    }
    return new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
  }, [city]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#667d70" />
    </lineSegments>
  );
}

export function LandOverlays({
  city,
  overlays,
}: {
  city: CityDocumentV1;
  overlays: OverlayOptions;
}) {
  return (
    <>
      {overlays.zones && ZONE_TYPES.map((zone) => <ZoneCells key={zone} city={city} zone={zone} />)}
      {overlays.lots && <LotLines city={city} />}
      {overlays.grid && <GridLines city={city} />}
    </>
  );
}
