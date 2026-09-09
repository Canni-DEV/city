import {
  Box3,
  Group,
  type Material,
  MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from "three";
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { PoseBinder } from "./pose";

export async function loadGltf(source: GLTF | string): Promise<GLTF> {
  return typeof source === "string" ? new GLTFLoader().loadAsync(source) : source;
}
export function findSkinnedMesh(root: Object3D): SkinnedMesh {
  let mesh: SkinnedMesh | undefined;
  root.traverse((node) => {
    if ((node as SkinnedMesh).isSkinnedMesh && !mesh) mesh = node as SkinnedMesh;
  });
  if (!mesh) throw new Error("GLTF must contain a SkinnedMesh");
  return mesh;
}
export interface PreparedCharacter {
  group: Group;
  mesh: SkinnedMesh;
  meshes: SkinnedMesh[];
  pose: PoseBinder;
  dispose(): void;
}

export function prepareCharacterRoot(
  gltf: GLTF,
  texture?: Texture,
  height?: number,
): PreparedCharacter {
  if (height !== undefined && (!Number.isFinite(height) || height <= 0))
    throw new Error("height must be positive");
  const group = new Group();
  const model = clone(gltf.scene);
  group.add(model);
  group.updateMatrixWorld(true);
  const meshes: SkinnedMesh[] = [];
  const owned: Material[] = [];
  const skin = texture?.clone();
  if (skin) {
    skin.colorSpace = SRGBColorSpace;
    skin.flipY = true;
    skin.needsUpdate = true;
  }
  model.traverse((node) => {
    const mesh = node as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    meshes.push(mesh);
    // Imported static bounds do not enclose all procedural limb poses.
    // Avoid intermittent whole-mesh rejection without rebuilding bounds every frame.
    mesh.frustumCulled = false;
    mesh.skeleton.pose();
    if (skin) {
      const material = new MeshStandardMaterial({ map: skin, roughness: 0.7, vertexColors: false });
      owned.push(material);
      mesh.material = material;
    }
  });
  const mesh = findSkinnedMesh(model);
  group.updateMatrixWorld(true);
  for (const m of meshes) m.computeBoundingBox();
  const bounds = new Box3().setFromObject(group);
  if (height) model.scale.multiplyScalar(height / bounds.getSize(new Vector3()).y);
  group.updateMatrixWorld(true);
  for (const m of meshes) m.computeBoundingBox();
  model.position.y -= new Box3().setFromObject(group).min.y;
  group.updateMatrixWorld(true);
  const pose = new PoseBinder();
  pose.capture(model, mesh);
  return {
    group,
    mesh,
    meshes,
    pose,
    dispose: () => {
      for (const m of owned) m.dispose();
      skin?.dispose();
      for (const m of meshes) m.skeleton.dispose();
    },
  };
}
