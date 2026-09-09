import { Html, PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three/webgpu";
import { npcScenePose } from "../city/npc-visual";
import type { SimulationRuntime } from "../city/simulation-runtime";
import {
  EXPERIENCE_FINAL_ACT,
  type ExperienceHero,
  experienceCameraFrame,
} from "./experience-timeline";

export function ExperienceCamera({
  progress,
  size,
  hero,
}: {
  progress: number;
  size: number;
  hero: ExperienceHero | null;
}) {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  useFrame(() => {
    const target = camera.current;
    if (!target) return;
    const frame = experienceCameraFrame(progress, size, hero);
    target.position.set(...frame.position);
    target.fov = frame.fov;
    target.near = 0.05;
    target.far = size * 16;
    target.lookAt(...frame.target);
    target.updateProjectionMatrix();
    target.updateMatrixWorld();
  }, -1);
  return <PerspectiveCamera ref={camera} makeDefault fov={34} near={0.05} far={size * 16} />;
}

export function ExperienceHeroPrompt({
  runtime,
  heroId,
  progress,
  label,
  onMeet,
}: {
  runtime: SimulationRuntime;
  heroId: string;
  progress: number;
  label: string;
  onMeet: () => void;
}) {
  const anchor = useRef<THREE.Group>(null);
  useFrame(() => {
    const pose = runtime.display.get(heroId) ?? runtime.world.poses.get(heroId);
    if (!pose || !anchor.current) return;
    const scene = npcScenePose(pose, runtime.city.map.size);
    anchor.current.position.set(scene.x, scene.y, scene.z);
  });
  if (progress < EXPERIENCE_FINAL_ACT) return null;
  return (
    <group ref={anchor}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.22, 0.28, 36]} />
        <meshBasicMaterial color="#d3ff99" transparent opacity={0.95} depthTest={false} />
      </mesh>
      <Html center position={[0, 1.75, 0]} zIndexRange={[20, 0]}>
        <button type="button" className="experience-meet" onClick={onMeet}>
          {label}
        </button>
      </Html>
    </group>
  );
}

export function ExperienceSceneReady({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const ready = useRef(false);
  const callback = useRef(onReady);
  callback.current = onReady;
  useFrame(() => {
    if (ready.current || ++frames.current < 2) return;
    ready.current = true;
    callback.current();
  });
  useEffect(
    () => () => {
      ready.current = true;
    },
    [],
  );
  return null;
}
