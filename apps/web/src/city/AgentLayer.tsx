import { type AssetCatalogEntry, assetById, runtimeAssetUrl } from "@city/assets";
import type { CreateAnimatedCharacterOptions } from "@city/procedural-animation";
import { useGLTF } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three/webgpu";
import { npcScenePose } from "./npc-visual";
import type { SimulationRuntime } from "./simulation-runtime";
import { useAnimatedCharacter } from "./use-animated-character";

function skinUrl(entry: AssetCatalogEntry, skin: string, baseUrl: string): string {
  const path =
    entry.texturePaths.find((candidate) => candidate.endsWith(`/${skin}.png`)) ??
    entry.texturePaths[0];
  return runtimeAssetUrl(path ?? "", baseUrl);
}

function numericNpcSeed(seed: string, id: string): number {
  let value = 2166136261;
  for (const character of `${seed}:${id}`) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function AgentAvatar({
  id,
  runtime,
  entry,
  mapSize,
  selected,
  onSelect,
}: {
  id: string;
  runtime: SimulationRuntime;
  entry: AssetCatalogEntry;
  mapSize: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const pick = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Mesh>(null);
  const { scene, animations } = useGLTF(
    runtimeAssetUrl(entry.runtimePath, import.meta.env.BASE_URL),
  );
  const skin = runtime.world.appearance.get(id)?.skin ?? "skaterMaleA";
  const texture = useLoader(THREE.TextureLoader, skinUrl(entry, skin, import.meta.env.BASE_URL));
  const height = entry.dimensions[1] * (entry.uniformScale ?? 1);
  const locomotion = runtime.world.locomotion.get(id);
  const { actor, actorRef } = useAnimatedCharacter(
    () => ({
      gltf: { scene, animations } as CreateAnimatedCharacterOptions["gltf"],
      texture,
      height,
      seed: numericNpcSeed(runtime.world.seed, id),
      animation: {
        walkSpeed: locomotion?.speed ?? runtime.world.orchestration.walkSpeed,
        runSpeed: locomotion?.runSpeed ?? runtime.world.orchestration.runSpeed,
      },
    }),
    [animations, height, id, mapSize, runtime, scene, texture],
    (created) => {
      created.object.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      runtime.animationActors.set(id, created);
      const pose = runtime.world.poses.get(id);
      if (pose) {
        created.fixedUpdate(1 / 60, {
          position: npcScenePose(pose, mapSize),
          facingYaw: pose.yaw,
          velocity: { x: 0, y: 0, z: 0 },
          grounded: true,
        });
      }
      return () => {
        if (runtime.animationActors.get(id) === created) runtime.animationActors.delete(id);
        runtime.animationSequences.delete(id);
        runtime.motionRequests.delete(id);
      };
    },
  );

  useFrame(() => {
    const current = actorRef.current;
    if (!current) return;
    current.updateVisual(runtime.animationAlpha);
    const pose = runtime.display.get(id) ?? runtime.world.poses.get(id);
    if (!pose) return;
    const visual = npcScenePose(pose, mapSize);
    pick.current?.position.set(visual.x, visual.y + height / 2, visual.z);
    marker.current?.position.set(visual.x, visual.y + 0.015, visual.z);
  }, -1);

  if (!actor) return null;
  return (
    <>
      <primitive object={actor.object} />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: WebGL pick geometry has an equivalent accessible selector. */}
      <mesh
        ref={pick}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(id);
        }}
      >
        <capsuleGeometry args={[Math.max(0.12, height * 0.3), Math.max(0.12, height), 4, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {selected && (
        <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.15, 0.19, 32]} />
          <meshBasicMaterial color="#d3ff99" transparent opacity={0.95} depthTest={false} />
        </mesh>
      )}
    </>
  );
}

export function AgentLayer({
  runtime,
  count,
  selected,
  onSelect,
}: {
  runtime: SimulationRuntime;
  count: number;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
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
          mapSize={runtime.city.map.size}
          selected={selected === id}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
