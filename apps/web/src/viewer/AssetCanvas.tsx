import type { AssetCatalogEntry } from "@city/assets";
import { runtimeAssetUrl } from "@city/assets";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, extend } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import type { WebGLRendererParameters } from "three";
import * as THREE from "three/webgpu";

extend(THREE as unknown as Parameters<typeof extend>[0]);

type Backend = "webgpu" | "webgl2";

function AssetModel({ entry }: { entry: AssetCatalogEntry }) {
  const { scene } = useGLTF(runtimeAssetUrl(entry.runtimePath, import.meta.env.BASE_URL));
  const clone = useMemo(() => scene.clone(true), [scene]);
  const scale = 3 / Math.max(...entry.dimensions);
  return (
    <primitive object={clone} position={[0, -entry.verticalOffset * scale, 0]} scale={scale} />
  );
}

async function createRenderer(
  parameters: WebGLRendererParameters,
  report: (backend: Backend) => void,
) {
  const canvas = parameters.canvas;
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("City requires an HTML canvas renderer surface.");
  }
  if (new URLSearchParams(window.location.search).has("forceWebGL")) {
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
    await renderer.init();
    report("webgl2");
    return renderer;
  }
  try {
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
    await renderer.init();
    report("webgpu");
    return renderer;
  } catch {
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
    await renderer.init();
    report("webgl2");
    return renderer;
  }
}

export function AssetCanvas({
  entry,
  onBackend,
}: {
  entry: AssetCatalogEntry;
  onBackend: (backend: Backend) => void;
}) {
  return (
    <Canvas
      camera={{ position: [5, 4, 5], fov: 38 }}
      gl={(parameters) => createRenderer(parameters, onBackend)}
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
