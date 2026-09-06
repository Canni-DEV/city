import {
  type AssetCatalogEntry,
  assetById,
  assetUniformScale,
  runtimeAssetUrl,
} from "@city/assets";
import type { VehicleRuntimeState } from "@city/core";
import { useGLTF } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import type { SimulationRuntime } from "./simulation-runtime";

function collectMeshes(scene: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
  });
  return meshes;
}

function VehicleBatch({
  entry,
  indices,
  vehiclesRef,
  runtime,
  half,
}: {
  entry: AssetCatalogEntry;
  indices: readonly number[];
  vehiclesRef: { current: VehicleRuntimeState[] };
  runtime: SimulationRuntime;
  half: number;
}) {
  const { scene } = useGLTF(runtimeAssetUrl(entry.runtimePath, import.meta.env.BASE_URL));
  const texture = useLoader(
    THREE.TextureLoader,
    runtimeAssetUrl(entry.texturePaths[0] ?? "", import.meta.env.BASE_URL),
  );
  const meshes = useMemo(() => collectMeshes(scene), [scene]);
  const localMatrices = useMemo(
    () =>
      meshes.map((mesh) => {
        const inverse = new THREE.Matrix4().copy(scene.matrixWorld).invert();
        return new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      }),
    [meshes, scene],
  );
  const materials = useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    return meshes.map(() => {
      const material = new THREE.MeshStandardNodeMaterial();
      material.color.set("#ffffff");
      material.metalness = 0.15;
      material.roughness = 0.55;
      material.map = texture;
      material.side = THREE.FrontSide;
      return material;
    });
  }, [meshes, texture]);
  const meshRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const scale = assetUniformScale(entry);

  const writeMatrices = () => {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    const basis = new THREE.Matrix4();
    const composed = new THREE.Matrix4();
    meshes.forEach((_, meshIndex) => {
      const target = meshRefs.current[meshIndex];
      const localMatrix = localMatrices[meshIndex];
      if (!target || !localMatrix) return;
      indices.forEach((vehicleIndex, instanceId) => {
        const vehicle = vehiclesRef.current[vehicleIndex];
        if (!vehicle) {
          target.setMatrixAt(instanceId, new THREE.Matrix4().makeScale(0, 0, 0));
          return;
        }
        const pose = runtime.vehicleDisplay.get(vehicle.id);
        if (!pose) return;
        position.set(pose.x - half, pose.y, pose.z - half);
        quaternion.setFromEuler(new THREE.Euler(0, pose.yaw, 0));
        scaleVec.set(scale, scale, scale);
        basis.compose(position, quaternion, scaleVec);
        composed.multiplyMatrices(basis, localMatrix);
        target.setMatrixAt(instanceId, composed);
      });
      target.instanceMatrix.needsUpdate = true;
      target.computeBoundingSphere();
    });
  };

  useLayoutEffect(() => {
    writeMatrices();
  });

  useFrame(() => {
    writeMatrices();
  });

  if (indices.length === 0) return null;
  return (
    <>
      {meshes.map((mesh, index) => {
        const geometry = mesh.geometry;
        const material = materials[index];
        if (!geometry || !material) return null;
        return (
          <instancedMesh
            key={`${entry.id}:${mesh.uuid || String(index)}`}
            ref={(node) => {
              meshRefs.current[index] = node;
            }}
            args={[geometry, material, indices.length]}
            castShadow
            receiveShadow
            frustumCulled={false}
          />
        );
      })}
    </>
  );
}

export function VehicleLayer({ runtime, count }: { runtime: SimulationRuntime; count: number }) {
  const vehiclesRef = runtime.vehicles;
  const spawned = vehiclesRef.current.slice(0, count);
  const groups = useMemo(() => {
    const next = new Map<string, number[]>();
    for (const [index, vehicle] of spawned.entries()) {
      const list = next.get(vehicle.assetId) ?? [];
      list.push(index);
      next.set(vehicle.assetId, list);
    }
    return next;
  }, [spawned]);

  const half = runtime.city.map.size / 2;
  return (
    <>
      {[...groups.entries()].map(([assetId, indices]) => {
        const entry = assetById.get(assetId);
        if (!entry) return null;
        return (
          <VehicleBatch
            key={`${runtime.city.id}:${assetId}`}
            entry={entry}
            indices={indices}
            vehiclesRef={vehiclesRef}
            runtime={runtime}
            half={half}
          />
        );
      })}
    </>
  );
}
