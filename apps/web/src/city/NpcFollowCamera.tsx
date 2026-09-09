import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type ComponentRef, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import { followFramingIsValid, offsetNpcFollowCamera } from "./camera-mode";
import { npcScenePose } from "./npc-visual";
import type { SimulationRuntime } from "./simulation-runtime";

function followTarget(
  runtime: SimulationRuntime,
  id: string,
  mapSize: number,
  target: THREE.Vector3,
): boolean {
  const actor = runtime.animationActors.get(id);
  if (actor?.object.parent) {
    actor.hipWorldPosition(target);
    if ([target.x, target.y, target.z].every(Number.isFinite)) return true;
  }
  const pose = runtime.display.get(id) ?? runtime.world.poses.get(id);
  if (!pose || ![pose.x, pose.y, pose.z].every(Number.isFinite)) return false;
  const scene = npcScenePose(pose, mapSize);
  target.set(scene.x, scene.y + 0.1, scene.z);
  return true;
}

function frameFollowCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
  const placed = offsetNpcFollowCamera(target);
  camera.position.set(placed.x, placed.y, placed.z);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

export function NpcFollowCamera({
  runtime,
  id,
  size,
}: {
  runtime: SimulationRuntime;
  id: string;
  size: number;
}) {
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);
  const viewSize = useThree((state) => state.size);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const target = useRef(new THREE.Vector3());
  const framedForId = useRef<string | null>(null);
  const frameKey = `${id}:${size}`;

  // Own the perspective camera and pass it into OrbitControls. On the first
  // render the R3F default is still the city orthographic camera, and drei's
  // PerspectiveCamera ref stays null, so orbit would otherwise bind at the origin.
  const camera = useMemo(() => {
    const next = new THREE.PerspectiveCamera(50, 1, 0.05, size * 16);
    const hip = new THREE.Vector3();
    if (followTarget(runtime, id, size, hip)) frameFollowCamera(next, hip);
    else frameFollowCamera(next, hip.set(0, 0.9, 0));
    return next;
  }, [id, runtime, size]);

  useLayoutEffect(() => {
    const previous = get().camera;
    camera.aspect = viewSize.width / Math.max(viewSize.height, 1);
    camera.near = 0.05;
    camera.far = size * 16;
    camera.updateProjectionMatrix();
    set({ camera });
    const orbit = controls.current;
    if (orbit && followTarget(runtime, id, size, target.current)) {
      if (
        framedForId.current !== frameKey ||
        !followFramingIsValid(camera.position, target.current)
      ) {
        frameFollowCamera(camera, target.current);
        framedForId.current = frameKey;
      }
      orbit.target.copy(target.current);
      orbit.update();
    }
    return () => set({ camera: previous });
  }, [camera, frameKey, get, id, runtime, set, size, viewSize.height, viewSize.width]);

  useFrame(() => {
    const orbit = controls.current;
    if (!orbit || !followTarget(runtime, id, size, target.current)) return;
    if (
      framedForId.current !== frameKey ||
      !followFramingIsValid(camera.position, target.current)
    ) {
      frameFollowCamera(camera, target.current);
      orbit.target.copy(target.current);
      framedForId.current = frameKey;
      orbit.update();
      return;
    }
    orbit.target.lerp(target.current, 0.1);
    orbit.update();
  }, 1);

  return (
    <>
      <primitive object={camera} />
      <OrbitControls
        ref={controls}
        camera={camera}
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI * 0.48}
        minDistance={0.6}
        maxDistance={28}
      />
    </>
  );
}
