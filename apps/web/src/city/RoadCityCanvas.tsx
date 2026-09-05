import { assetById, runtimeAssetUrl } from "@city/assets";
import type { CityDocumentV1 } from "@city/core";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { createCompatibleRenderer, type RendererBackend } from "../rendering/renderer";
import { LandOverlays, type OverlayOptions } from "./LandOverlays";

function UrbanGround({ document }: { document: CityDocumentV1 }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const validCells = useMemo(
    () => document.map.boundaryMask.flatMap((valid, index) => (valid ? [index] : [])),
    [document],
  );

  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const half = document.map.size / 2;
    validCells.forEach((cellIndex, instanceIndex) => {
      const x = cellIndex % document.map.size;
      const y = Math.floor(cellIndex / document.map.size);
      matrix.makeTranslation(x - half + 0.5, -0.09, y - half + 0.5);
      target.setMatrixAt(instanceIndex, matrix);
    });
    target.instanceMatrix.needsUpdate = true;
  }, [document, validCells]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, validCells.length]} receiveShadow>
      <boxGeometry args={[1.01, 0.16, 1.01]} />
      <meshStandardMaterial color="#7c9b6a" roughness={0.95} />
    </instancedMesh>
  );
}

function RoadUnderlay({ document }: { document: CityDocumentV1 }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const half = document.map.size / 2;
    document.roadGraph.cells.forEach((cell, instanceIndex) => {
      matrix.makeTranslation(cell.position[0] - half + 0.5, 0.02, cell.position[1] - half + 0.5);
      target.setMatrixAt(instanceIndex, matrix);
    });
    target.instanceMatrix.needsUpdate = true;
  }, [document]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, document.roadGraph.cells.length]}>
      <boxGeometry args={[0.84, 0.04, 0.84]} />
      <meshStandardMaterial color="#525b60" roughness={0.92} />
    </instancedMesh>
  );
}

function RoadTile({
  assetId,
  position,
  rotation,
  size,
}: {
  assetId: string;
  position: [number, number];
  rotation: number;
  size: number;
}) {
  const entry = assetById.get(assetId);
  if (!entry) throw new Error(`Road asset is absent from the catalog: ${assetId}`);
  const { scene } = useGLTF(runtimeAssetUrl(entry.runtimePath, import.meta.env.BASE_URL));
  const clone = useMemo(() => scene.clone(true), [scene]);
  const half = size / 2;
  return (
    <primitive
      object={clone}
      position={[position[0] - half + 0.5, 0.015, position[1] - half + 0.5]}
      rotation={[0, (-rotation * Math.PI) / 180, 0]}
    />
  );
}

function RoadModels({ document }: { document: CityDocumentV1 }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      {document.roadGraph.cells.map((cell) => (
        <RoadTile
          key={cell.id}
          assetId={cell.assetId}
          position={cell.position}
          rotation={cell.rotation}
          size={document.map.size}
        />
      ))}
    </Suspense>
  );
}

function GateMarker({ position, size }: { position: [number, number]; size: number }) {
  const half = size / 2;
  return (
    <mesh position={[position[0] - half + 0.5, 0.55, position[1] - half + 0.5]} castShadow>
      <cylinderGeometry args={[0.22, 0.32, 1, 8]} />
      <meshStandardMaterial color="#d3ff99" emissive="#5d812d" emissiveIntensity={0.3} />
    </mesh>
  );
}

function DistrictMarker({ position, size }: { position: [number, number]; size: number }) {
  const half = size / 2;
  return (
    <mesh position={[position[0] - half + 0.5, 0.42, position[1] - half + 0.5]} castShadow>
      <cylinderGeometry args={[0.34, 0.48, 0.8, 12]} />
      <meshStandardMaterial color="#ffbd66" emissive="#7b4817" emissiveIntensity={0.25} />
    </mesh>
  );
}

function RoadScene({ document, overlays }: { document: CityDocumentV1; overlays: OverlayOptions }) {
  const size = document.map.size;
  return (
    <>
      <color attach="background" args={["#0b1210"]} />
      <fog attach="fog" args={["#0b1210", size * 1.6, size * 3.2]} />
      <ambientLight intensity={1.3} />
      <directionalLight
        castShadow
        intensity={2.4}
        position={[size * 0.25, size * 0.55, size * 0.2]}
      />
      <mesh position={[0, -0.22, 0]} receiveShadow>
        <boxGeometry args={[size + 4, 0.24, size + 4]} />
        <meshBasicMaterial color="#17241f" />
      </mesh>
      <UrbanGround document={document} />
      <LandOverlays city={document} overlays={overlays} />
      <RoadUnderlay document={document} />
      <RoadModels key={document.id} document={document} />
      {document.roadGraph.nodes
        .filter((node) => node.kind === "gate")
        .map((gate) => (
          <GateMarker key={gate.id} position={gate.position} size={size} />
        ))}
      {document.roadGraph.nodes
        .filter((node) => node.kind === "district")
        .map((district) => (
          <DistrictMarker key={district.id} position={district.position} size={size} />
        ))}
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        minZoom={3}
        maxZoom={28}
        maxPolarAngle={Math.PI * 0.48}
      />
    </>
  );
}

export function RoadCityCanvas({
  document,
  onBackend,
  overlays,
}: {
  document: CityDocumentV1 | null;
  onBackend: (backend: RendererBackend) => void;
  overlays: OverlayOptions;
}) {
  const size = document?.map.size ?? 64;
  return (
    <Canvas
      aria-label={
        document ? `3D city streets, lots, and zones for ${document.name}` : "Empty city viewport"
      }
      orthographic
      camera={{
        position: [size * 0.55, size * 0.7, size * 0.55],
        zoom: 9,
        near: 0.1,
        far: size * 5,
      }}
      gl={(parameters) => createCompatibleRenderer(parameters, onBackend)}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      shadows
    >
      {document ? (
        <RoadScene key={document.id} document={document} overlays={overlays} />
      ) : (
        <color attach="background" args={["#0b1210"]} />
      )}
    </Canvas>
  );
}
