import {
  type AssetCatalogEntry,
  agentUniformScale,
  assetById,
  runtimeAssetUrl,
} from "@city/assets";
import {
  type AgentRuntimeState,
  agentWorldPosition,
  type CityDocumentV1,
  clipForAgent,
  createRoadWalkPolicy,
  spawnAgents,
  tickAgents,
} from "@city/core";
import { useGLTF } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import * as THREE from "three/webgpu";

function skinUrl(entry: AssetCatalogEntry, skin: string, baseUrl: string): string {
  const path =
    entry.texturePaths.find((texture) => texture.endsWith(`/${skin}.png`)) ?? entry.texturePaths[0];
  return runtimeAssetUrl(path ?? "", baseUrl);
}

function AgentAvatar({
  index,
  agentsRef,
  entry,
  half,
}: {
  index: number;
  agentsRef: { current: AgentRuntimeState[] };
  entry: AssetCatalogEntry;
  half: number;
}) {
  const group = useRef<THREE.Group>(null);
  const clip = useRef<"idle" | "run">("idle");
  const { scene, animations } = useGLTF(
    runtimeAssetUrl(entry.runtimePath, import.meta.env.BASE_URL),
  );
  const skin = agentsRef.current[index]?.skin ?? "skaterMaleA";
  const texture = useLoader(THREE.TextureLoader, skinUrl(entry, skin, import.meta.env.BASE_URL));
  const root = useMemo(() => clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
  const idleClip = animations.find((item) => item.name === "idle");
  const runClip = animations.find((item) => item.name === "run");
  const idleAction = useMemo(
    () => (idleClip ? mixer.clipAction(idleClip) : null),
    [mixer, idleClip],
  );
  const runAction = useMemo(() => (runClip ? mixer.clipAction(runClip) : null), [mixer, runClip]);
  const scale = agentUniformScale(entry);

  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.needsUpdate = true;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = materials.map((material) => {
        const cloned = material.clone();
        if ("map" in cloned) {
          (cloned as THREE.MeshStandardMaterial).map = texture;
          cloned.needsUpdate = true;
        }
        return cloned;
      });
      mesh.material = next.length === 1 ? (next[0] ?? mesh.material) : next;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [root, texture]);

  useLayoutEffect(() => {
    idleAction?.reset().play();
    runAction?.reset().play();
    idleAction?.setEffectiveWeight(1);
    runAction?.setEffectiveWeight(0);
    return () => {
      mixer.stopAllAction();
    };
  }, [idleAction, mixer, runAction]);

  useFrame((_, delta) => {
    const agent = agentsRef.current[index];
    const target = group.current;
    if (!agent || !target) {
      if (target) target.visible = false;
      return;
    }
    target.visible = true;
    const [x, , z] = agentWorldPosition(agent);
    target.position.set(x - half, 0, z - half);
    target.rotation.y = agent.heading;
    const nextClip = clipForAgent(agent);
    if (nextClip !== clip.current) {
      clip.current = nextClip;
      idleAction?.setEffectiveWeight(nextClip === "idle" ? 1 : 0);
      runAction?.setEffectiveWeight(nextClip === "run" ? 1 : 0);
    }
    mixer.update(Math.min(delta, 0.05));
  });

  return (
    <group ref={group} scale={scale}>
      <primitive object={root} position={[0, entry.verticalOffset, 0]} />
    </group>
  );
}

export function AgentLayer({ document, count }: { document: CityDocumentV1; count: number }) {
  const body = assetById.get("protagonists:character-medium");
  const spawned = useMemo(
    () =>
      spawnAgents({
        seed: document.generator.seed,
        tiles: document.roadGraph.cells,
        count,
      }),
    [count, document.generator.seed, document.roadGraph.cells],
  );
  const agentsRef = useRef(spawned);
  const policy = useMemo(
    () => createRoadWalkPolicy(document.roadGraph.cells),
    [document.roadGraph.cells],
  );

  useLayoutEffect(() => {
    agentsRef.current = spawned;
  }, [spawned]);

  useFrame((_, delta) => {
    agentsRef.current = tickAgents(agentsRef.current, {
      policy,
      dt: Math.min(delta, 0.05),
      seed: document.generator.seed,
    });
  });

  if (!body) return null;
  return (
    <>
      {spawned.map((agent) => (
        <AgentAvatar
          key={`${document.id}:${agent.id}`}
          index={agent.index}
          agentsRef={agentsRef}
          entry={body}
          half={document.map.size / 2}
        />
      ))}
    </>
  );
}
