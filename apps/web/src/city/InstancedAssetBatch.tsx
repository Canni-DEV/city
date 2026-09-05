import { assetById, runtimeAssetUrl } from "@city/assets";
import { useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import type { RenderBatch } from "../rendering/instance-map";

function collectMeshes(scene: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
  });
  return meshes;
}

function applyVariantMap(material: THREE.Material, map: THREE.Texture | null) {
  const next = material.clone();
  if (map && "map" in next) {
    (next as THREE.MeshStandardMaterial).map = map;
    next.needsUpdate = true;
  }
  return next;
}

function InstancedPrototype({
  geometry,
  material,
  localMatrix,
  items,
  half,
  castShadow,
  onSelect,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  localMatrix: THREE.Matrix4;
  items: RenderBatch["items"];
  half: number;
  castShadow: boolean;
  onSelect?: (id: string | null) => void;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const composed = new THREE.Matrix4();
    const basis = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    items.forEach((item, index) => {
      position.set(item.position[0] - half, item.position[1], item.position[2] - half);
      euler.set(
        ((item.rotation[0] ?? 0) * Math.PI) / 180,
        (-(item.rotation[1] ?? 0) * Math.PI) / 180,
        ((item.rotation[2] ?? 0) * Math.PI) / 180,
      );
      quaternion.setFromEuler(euler);
      scale.set(item.scale[0], item.scale[1], item.scale[2]);
      basis.compose(position, quaternion, scale);
      composed.multiplyMatrices(basis, localMatrix);
      target.setMatrixAt(index, composed);
    });
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
  }, [items, half, localMatrix]);

  return (
    // R3F instanced meshes are GPU objects, not DOM nodes; picking uses the R3F raycaster.
    // biome-ignore lint/a11y/noStaticElementInteractions: Three.js instance picking, not a DOM control
    <instancedMesh
      ref={mesh}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              const id =
                event.instanceId === undefined ? null : (items[event.instanceId]?.id ?? null);
              onSelect(id);
            }
          : undefined
      }
    />
  );
}

export function InstancedAssetBatch({
  batch,
  half,
  castShadow,
  onSelect,
}: {
  batch: RenderBatch;
  half: number;
  castShadow: boolean;
  onSelect?: (id: string | null) => void;
}) {
  const entry = assetById.get(batch.assetId);
  if (!entry) throw new Error(`Missing catalog entry ${batch.assetId}`);
  const { scene } = useGLTF(runtimeAssetUrl(entry.runtimePath, import.meta.env.BASE_URL));
  const texture = useLoader(
    THREE.TextureLoader,
    runtimeAssetUrl(batch.texturePath, import.meta.env.BASE_URL),
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
    return meshes.map((mesh) => applyVariantMap(mesh.material as THREE.Material, texture));
  }, [meshes, texture]);

  if (!batch.items.length) return null;
  return (
    <>
      {meshes.map((mesh, index) => {
        const geometry = mesh.geometry;
        const material = materials[index];
        const localMatrix = localMatrices[index];
        if (!geometry || !material || !localMatrix) return null;
        return (
          <InstancedPrototype
            key={`${batch.key}:${mesh.uuid || String(index)}`}
            geometry={geometry}
            material={material}
            localMatrix={localMatrix}
            items={batch.items}
            half={half}
            castShadow={castShadow}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}
