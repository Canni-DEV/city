import type { AssetCatalogEntry } from "@city/assets";
import { runtimeAssetUrl } from "@city/assets";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, type RootState } from "@react-three/fiber";
import { Suspense, useCallback, useMemo } from "react";
import {
  createCompatibleRenderer,
  detectRendererBackend,
  type RendererBackend,
  syncRendererLayout,
} from "../rendering/renderer";

function AssetModel({ entry }: { entry: AssetCatalogEntry }) {
  const { scene } = useGLTF(runtimeAssetUrl(entry.runtimePath, import.meta.env.BASE_URL));
  const clone = useMemo(() => scene.clone(true), [scene]);
  const scale = 3 / Math.max(...entry.dimensions);
  return (
    <primitive object={clone} position={[0, -entry.verticalOffset * scale, 0]} scale={scale} />
  );
}

export function AssetCanvas({
  entry,
  onBackend,
}: {
  entry: AssetCatalogEntry;
  onBackend: (backend: RendererBackend) => void;
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
      camera={{ position: [5, 4, 5], fov: 38 }}
      style={{ position: "absolute", inset: 0 }}
      gl={createCompatibleRenderer}
      onCreated={onCreated}
      shadows
    >
      <color attach="background" args={["#111a18"]} />
      <ambientLight intensity={1.4} />
      <directionalLight castShadow intensity={2.8} position={[4, 7, 3]} />
      <gridHelper args={[10, 20, "#547065", "#293a34"]} />
      <axesHelper args={[2]} />
      <Suspense fallback={null}>
        <AssetModel entry={entry} />
      </Suspense>
      <OrbitControls makeDefault target={[0, 0.8, 0]} />
    </Canvas>
  );
}
