import { assetById, runtimeAssetUrl } from "@city/assets";
import type { CityDocumentV1 } from "@city/core";
import { OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { Canvas, type RootState, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  buildEntityBatches,
  buildRoadBatches,
  buildSidewalkBatches,
} from "../rendering/instance-map";
import type { ResolvedQuality } from "../rendering/quality";
import {
  createCompatibleRenderer,
  detectRendererBackend,
  type RendererBackend,
  syncRendererLayout,
} from "../rendering/renderer";
import { AgentLayer } from "./AgentLayer";
import { FreeFlightControls } from "./FreeFlightControls";
import { InstancedAssetBatch } from "./InstancedAssetBatch";
import { LandOverlays, type OverlayOptions } from "./LandOverlays";

const EMPTY_CITY_CAMERA = {
  position: [52.8, 67.2, 52.8] as [number, number, number],
  zoom: 9,
  near: 0.1,
  far: 640,
};

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

function CityCamera({ size }: { size: number }) {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.position.set(size * 0.55, size * 0.7, size * 0.55);
    camera.near = 0.1;
    camera.far = size * 5;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function FrameStats({ onStats }: { onStats: (stats: { fps: number; drawCalls: number }) => void }) {
  const frames = useRef(0);
  const elapsed = useRef(0);
  const callback = useRef(onStats);
  callback.current = onStats;
  useFrame((state, delta) => {
    frames.current += 1;
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    const fps = frames.current / elapsed.current;
    frames.current = 0;
    elapsed.current = 0;
    const info = (state.gl as { info?: { render?: { calls?: number } } }).info?.render?.calls;
    callback.current({ fps, drawCalls: typeof info === "number" ? info : 0 });
  });
  return null;
}

function SelectionProxyModel({
  document,
  entity,
}: {
  document: CityDocumentV1;
  entity: NonNullable<CityDocumentV1["entities"][string]>;
}) {
  const entry = assetById.get(entity.assetId);
  if (!entry) return null;
  return (
    <SelectionOutline
      document={document}
      entity={entity}
      runtimePath={entry.runtimePath}
      height={entry.dimensions[1]}
    />
  );
}

function SelectionOutline({
  document,
  entity,
  runtimePath,
  height,
}: {
  document: CityDocumentV1;
  entity: NonNullable<CityDocumentV1["entities"][string]>;
  runtimePath: string;
  height: number;
}) {
  const { scene } = useGLTF(runtimeAssetUrl(runtimePath, import.meta.env.BASE_URL));
  const clone = useMemo(() => scene.clone(true), [scene]);
  const half = document.map.size / 2;
  return (
    <group
      position={[
        entity.transform.position[0] - half,
        entity.transform.position[1],
        entity.transform.position[2] - half,
      ]}
      rotation={[
        ((entity.transform.rotation[0] ?? 0) * Math.PI) / 180,
        (-(entity.transform.rotation[1] ?? 0) * Math.PI) / 180,
        ((entity.transform.rotation[2] ?? 0) * Math.PI) / 180,
      ]}
    >
      <primitive object={clone} visible={false} />
      <mesh position={[0, Math.max(height, 0.4) * 0.5, 0]}>
        <boxGeometry
          args={[entity.footprint.width + 0.12, height + 0.2, entity.footprint.depth + 0.12]}
        />
        <meshBasicMaterial color="#d3ff99" wireframe transparent opacity={0.95} />
      </mesh>
    </group>
  );
}

function SelectionProxy({
  document,
  entityId,
}: {
  document: CityDocumentV1;
  entityId: string | null;
}) {
  const entity = entityId ? document.entities[entityId] : undefined;
  if (!entity) return null;
  return <SelectionProxyModel document={document} entity={entity} />;
}

function CityScene({
  document,
  overlays,
  quality,
  selectedEntityId,
  freeCamera,
  onSelect,
  onStats,
}: {
  document: CityDocumentV1;
  overlays: OverlayOptions;
  quality: ResolvedQuality;
  selectedEntityId: string | null;
  freeCamera: boolean;
  onSelect: (id: string | null) => void;
  onStats: (stats: { fps: number; drawCalls: number }) => void;
}) {
  const size = document.map.size;
  const half = size / 2;
  const entityBatches = useMemo(
    () =>
      buildEntityBatches(document, {
        useLod: quality.useLod,
        showDecoration: quality.showDecoration,
      }),
    [document, quality.showDecoration, quality.useLod],
  );
  const roadBatches = useMemo(() => buildRoadBatches(document), [document]);
  const sidewalkBatches = useMemo(() => buildSidewalkBatches(document), [document]);

  useEffect(() => {
    for (const batch of [...entityBatches.batches, ...roadBatches, ...sidewalkBatches]) {
      const entry = assetById.get(batch.assetId);
      if (entry) useGLTF.preload(runtimeAssetUrl(entry.runtimePath, import.meta.env.BASE_URL));
    }
    const body = assetById.get("protagonists:character-medium");
    if (body) useGLTF.preload(runtimeAssetUrl(body.runtimePath, import.meta.env.BASE_URL));
  }, [entityBatches.batches, roadBatches, sidewalkBatches]);

  return (
    <>
      {freeCamera ? (
        <>
          <PerspectiveCamera
            makeDefault
            fov={62}
            near={0.05}
            far={size * 16}
            position={[size * 0.55, size * 0.7, size * 0.55]}
          />
          <FreeFlightControls />
        </>
      ) : (
        <CityCamera size={size} />
      )}
      <color attach="background" args={["#0b1210"]} />
      <fog attach="fog" args={["#0b1210", quality.fogNear, quality.fogFar]} />
      <ambientLight intensity={1.15} />
      <directionalLight
        castShadow={quality.shadows}
        intensity={2.2}
        position={[size * 0.26, size * 0.58, size * 0.18]}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={size * 2.2}
        shadow-camera-left={-quality.shadowSpan}
        shadow-camera-right={quality.shadowSpan}
        shadow-camera-top={quality.shadowSpan}
        shadow-camera-bottom={-quality.shadowSpan}
      />
      <FrameStats onStats={onStats} />
      <mesh position={[0, -0.22, 0]} receiveShadow>
        <boxGeometry args={[size + 4, 0.24, size + 4]} />
        <meshBasicMaterial color="#17241f" />
      </mesh>
      <UrbanGround document={document} />
      <LandOverlays city={document} overlays={overlays} />
      <Suspense fallback={null}>
        {sidewalkBatches.map((batch) => (
          <InstancedAssetBatch key={batch.key} batch={batch} half={half} castShadow={false} />
        ))}
        {roadBatches.map((batch) => (
          <InstancedAssetBatch key={batch.key} batch={batch} half={half} castShadow={false} />
        ))}
        {entityBatches.batches.map((batch) => (
          <InstancedAssetBatch
            key={batch.key}
            batch={batch}
            half={half}
            castShadow={quality.shadows}
            onSelect={(id) => {
              if (!id || entityBatches.entityToInstance.has(id)) onSelect(id);
            }}
          />
        ))}
        <SelectionProxy document={document} entityId={selectedEntityId} />
        <AgentLayer document={document} count={quality.agentCount} />
      </Suspense>
      {freeCamera ? null : (
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          minZoom={3}
          maxZoom={48}
          maxPolarAngle={Math.PI * 0.48}
        />
      )}
    </>
  );
}

export function CityCanvas({
  document,
  onBackend,
  overlays,
  quality,
  selectedEntityId,
  freeCamera,
  onSelect,
  onStats,
}: {
  document: CityDocumentV1 | null;
  onBackend: (backend: RendererBackend) => void;
  overlays: OverlayOptions;
  quality: ResolvedQuality;
  selectedEntityId: string | null;
  freeCamera: boolean;
  onSelect: (id: string | null) => void;
  onStats: (stats: { fps: number; drawCalls: number }) => void;
}) {
  const onCreated = useCallback(
    (state: RootState) => {
      syncRendererLayout(state.gl.domElement, state.setSize);
      onBackend(detectRendererBackend(state.gl));
    },
    [onBackend],
  );
  return (
    <Canvas
      aria-label={
        document
          ? `3D city with buildings, streets, and pedestrians for ${document.name}`
          : "Empty city viewport"
      }
      orthographic
      camera={EMPTY_CITY_CAMERA}
      dpr={[1, quality.pixelRatioCap]}
      style={{ position: "absolute", inset: 0 }}
      gl={createCompatibleRenderer}
      onCreated={onCreated}
      onPointerMissed={() => onSelect(null)}
      shadows={quality.shadows}
    >
      {document ? (
        <CityScene
          key={document.id}
          document={document}
          overlays={overlays}
          quality={quality}
          selectedEntityId={selectedEntityId}
          freeCamera={freeCamera}
          onSelect={onSelect}
          onStats={onStats}
        />
      ) : (
        <color attach="background" args={["#0b1210"]} />
      )}
    </Canvas>
  );
}
