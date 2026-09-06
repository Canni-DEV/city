import {
  type AssetCatalogEntry,
  agentUniformScale,
  assetById,
  runtimeAssetUrl,
} from "@city/assets";
import { useGLTF } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import * as THREE from "three/webgpu";
import type { SimulationRuntime } from "./simulation-runtime";

/** Kenney Run is a sprint; half speed matches DEFAULT_AGENT_SPEED (SIM-005). */
const RUN_CYCLE_TIME_SCALE = 0.5;

function skinUrl(entry: AssetCatalogEntry, skin: string, baseUrl: string): string {
  const path =
    entry.texturePaths.find((texture) => texture.endsWith(`/${skin}.png`)) ?? entry.texturePaths[0];
  return runtimeAssetUrl(path ?? "", baseUrl);
}

function bindAgentClips(
  mixer: THREE.AnimationMixer,
  animations: THREE.AnimationClip[],
): { idle: THREE.AnimationAction | null; run: THREE.AnimationAction | null } {
  const idleSource = animations.find((clip) => clip.name === "idle");
  const runSource = animations.find((clip) => clip.name === "run");
  const idle = idleSource ? mixer.clipAction(idleSource.clone()) : null;
  const run = runSource ? mixer.clipAction(runSource.clone()) : null;
  idle?.setLoop(THREE.LoopRepeat, Infinity);
  run?.setLoop(THREE.LoopRepeat, Infinity);
  run?.setEffectiveTimeScale(RUN_CYCLE_TIME_SCALE);
  return { idle, run };
}

function AgentAvatar({
  id,
  runtime,
  entry,
  half,
}: {
  id: string;
  runtime: SimulationRuntime;
  entry: AssetCatalogEntry;
  half: number;
}) {
  const group = useRef<THREE.Group>(null);
  const blend = useRef(0);
  const { scene, animations } = useGLTF(
    runtimeAssetUrl(entry.runtimePath, import.meta.env.BASE_URL),
  );
  const skin = runtime.world.appearance.get(id)?.skin ?? "skaterMaleA";
  const texture = useLoader(THREE.TextureLoader, skinUrl(entry, skin, import.meta.env.BASE_URL));
  const root = useMemo(() => clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
  const actions = useMemo(() => bindAgentClips(mixer, animations), [animations, mixer]);
  const scale = agentUniformScale(entry);

  useLayoutEffect(() => {
    const ownedMaterials: THREE.Material[] = [];
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.needsUpdate = true;
    root.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = materials.map(() => {
        const nodeMaterial = new THREE.MeshStandardNodeMaterial();
        nodeMaterial.color.set("#ffffff");
        nodeMaterial.metalness = 0;
        nodeMaterial.roughness = 0.7;
        nodeMaterial.map = texture;
        nodeMaterial.side = THREE.FrontSide;
        ownedMaterials.push(nodeMaterial);
        return nodeMaterial;
      });
      mesh.material = next.length === 1 ? (next[0] ?? mesh.material) : next;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return () => {
      for (const material of ownedMaterials) material.dispose();
    };
  }, [root, texture]);

  useLayoutEffect(() => {
    actions.idle?.play();
    actions.run?.play();
    actions.run?.setEffectiveWeight(0);
    return () => {
      // stopAllAction is enough. uncacheRoot wipes AnimationAction bindings while
      // React Strict Mode keeps the memoized mixer/actions, so the remount play()
      // crashes with `_cacheIndex` and unmounts the city canvas.
      mixer.stopAllAction();
    };
  }, [actions, mixer]);

  useFrame(() => {
    const pose = runtime.display.get(id),
      target = group.current;
    if (!pose || !target) return;
    target.position.set(pose.x - half, pose.y, pose.z - half);
    target.rotation.y = pose.yaw;
    const dt = runtime.animationDelta;
    const desired = Math.min(1, pose.speed / 0.12);
    blend.current += Math.max(-dt / 0.2, Math.min(dt / 0.2, desired - blend.current));
    actions.run?.setEffectiveWeight(blend.current);
    actions.idle?.setEffectiveWeight(1 - blend.current);
    actions.run?.setEffectiveTimeScale((RUN_CYCLE_TIME_SCALE * pose.speed) / 0.33);
    mixer.update(dt);
  });

  return (
    <group ref={group} scale={scale}>
      <primitive object={root} position={[0, entry.verticalOffset, 0]} />
    </group>
  );
}

export function AgentLayer({ runtime, count }: { runtime: SimulationRuntime; count: number }) {
  const body = assetById.get("protagonists:character-medium");
  if (!body) return null;
  return (
    <>
      {runtime.world.ids.slice(0, count).map((id) => (
        <AgentAvatar
          key={id}
          id={id}
          runtime={runtime}
          entry={body}
          half={runtime.city.map.size / 2}
        />
      ))}
    </>
  );
}
