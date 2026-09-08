import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type ComponentRef, useLayoutEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import type { SimulationRuntime } from "./simulation-runtime";

export function NpcFollowCamera({
  runtime,
  id,
  size,
}: {
  runtime: SimulationRuntime;
  id: string;
  size: number;
}) {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const target = useRef(new THREE.Vector3());
  const half = size / 2;

  useLayoutEffect(() => {
    const pose = runtime.display.get(id) ?? runtime.world.poses.get(id);
    const view = camera.current;
    if (!pose || !view) return;
    const x = pose.x - half,
      y = pose.y + 0.12,
      z = pose.z - half;
    view.position.set(x + 2.3, y + 1.3, z + 3);
    view.lookAt(x, y, z);
    view.updateProjectionMatrix();
    controls.current?.target.set(x, y, z);
    controls.current?.update();
  }, [half, id, runtime]);

  useFrame(() => {
    const pose = runtime.display.get(id) ?? runtime.world.poses.get(id);
    if (!pose || !controls.current) return;
    target.current.set(pose.x - half, pose.y + 0.12, pose.z - half);
    controls.current.target.lerp(target.current, 0.1);
    controls.current.update();
  }, -1);

  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault fov={50} near={0.05} far={size * 16} />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI * 0.48}
        minDistance={0.6}
        maxDistance={28}
      />
    </>
  );
}
