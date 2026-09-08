import { type AssetCatalogEntry, agentFootLift, assetById, runtimeAssetUrl } from "@city/assets";
import { createAnimatedCharacter } from "@city/procedural-animation";
import { useGLTF } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import type { SimulationRuntime } from "./simulation-runtime";

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
  half,
  selected,
  onSelect,
}: {
  id: string;
  runtime: SimulationRuntime;
  entry: AssetCatalogEntry;
  half: number;
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
  const actor = useMemo(
    () =>
      createAnimatedCharacter({
        gltf: { scene, animations } as Parameters<typeof createAnimatedCharacter>[0]["gltf"],
        texture,
        height,
        seed: numericNpcSeed(runtime.world.seed, id),
        animation: {
          walkSpeed: runtime.world.orchestration.walkSpeed,
          runSpeed: runtime.world.orchestration.runSpeed,
        },
      }),
    [animations, height, id, runtime, scene, texture],
  );

  useLayoutEffect(() => {
    actor.object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    runtime.animationActors.set(id, actor);
    const pose = runtime.world.poses.get(id);
    if (pose) {
      actor.fixedUpdate(1 / 60, {
        position: { x: pose.x, y: pose.y, z: pose.z },
        facingYaw: pose.yaw,
        velocity: { x: 0, y: 0, z: 0 },
        grounded: true,
      });
    }
    return () => {
      if (runtime.animationActors.get(id) === actor) runtime.animationActors.delete(id);
      runtime.animationSequences.delete(id);
      runtime.motionRequests.delete(id);
      actor.dispose();
    };
  }, [actor, id, runtime]);

  useFrame(() => {
    actor.updateVisual(runtime.animationAlpha);
    const pose = runtime.display.get(id) ?? runtime.world.poses.get(id);
    if (!pose) return;
    pick.current?.position.set(pose.x, pose.y + height / 2, pose.z);
    marker.current?.position.set(pose.x, pose.y + 0.015, pose.z);
  });

  return (
    <group position={[-half, agentFootLift(), -half]}>
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
    </group>
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
          half={runtime.city.map.size / 2}
          selected={selected === id}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
