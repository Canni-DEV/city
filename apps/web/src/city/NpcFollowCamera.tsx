import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  clampNpcFollowDistance,
  clampNpcFollowPitch,
  followFramingIsValid,
  NPC_FOLLOW_DISTANCE,
  NPC_FOLLOW_PITCH,
  npcFollowCameraPose,
  springNpcFollowLook,
} from "./camera-mode";
import { isEditableTarget } from "./keyboard";
import { npcScenePose } from "./npc-visual";
import type { SimulationRuntime } from "./simulation-runtime";

const LOOK_SENSITIVITY = 0.005;
const LOOK_KEY_SPEED = 1.2;
const WHEEL_DISTANCE = 0.0025;
const MOVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

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

function followYaw(runtime: SimulationRuntime, id: string): number {
  const pose = runtime.display.get(id) ?? runtime.world.poses.get(id);
  return pose && Number.isFinite(pose.yaw) ? pose.yaw : 0;
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
  const gl = useThree((state) => state.gl);
  const viewSize = useThree((state) => state.size);
  const target = useRef(new THREE.Vector3());
  const framedForId = useRef<string | null>(null);
  const look = useRef({ yaw: 0, pitch: NPC_FOLLOW_PITCH, distance: NPC_FOLLOW_DISTANCE });
  const dragging = useRef(false);
  const springFromOrbit = useRef(false);
  const keys = useRef(new Set<string>());
  const frameKey = `${id}:${size}`;

  const camera = useMemo(() => {
    const next = new THREE.PerspectiveCamera(50, 1, 0.05, size * 16);
    Object.assign(next, { manual: true });
    const hip = new THREE.Vector3();
    const yaw = followYaw(runtime, id);
    if (followTarget(runtime, id, size, hip)) {
      const placed = npcFollowCameraPose(hip, yaw);
      next.position.set(placed.x, placed.y, placed.z);
      next.lookAt(hip);
    } else {
      const placed = npcFollowCameraPose({ x: 0, y: 0.9, z: 0 }, 0);
      next.position.set(placed.x, placed.y, placed.z);
      next.lookAt(0, 0.9, 0);
    }
    next.updateProjectionMatrix();
    return next;
  }, [id, runtime, size]);

  useLayoutEffect(() => {
    const previous = get().camera;
    camera.aspect = viewSize.width / Math.max(viewSize.height, 1);
    camera.near = 0.05;
    camera.far = size * 16;
    camera.updateProjectionMatrix();
    set({ camera });
    look.current = { yaw: 0, pitch: NPC_FOLLOW_PITCH, distance: NPC_FOLLOW_DISTANCE };
    springFromOrbit.current = false;
    framedForId.current = null;
    return () => set({ camera: previous });
  }, [camera, get, set, size, viewSize.height, viewSize.width]);

  useLayoutEffect(() => {
    const element = gl.domElement;
    element.tabIndex = 0;

    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      keys.current.add(event.code);
      if (event.code === "KeyQ" || event.code === "KeyE") event.preventDefault();
    }
    function onKeyUp(event: KeyboardEvent) {
      keys.current.delete(event.code);
    }
    function onPointerDown(event: PointerEvent) {
      if (event.button !== 2) return;
      dragging.current = true;
      springFromOrbit.current = false;
      element.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
    function onPointerUp(event: PointerEvent) {
      if (event.button !== 2) return;
      dragging.current = false;
      springFromOrbit.current = true;
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    }
    function onPointerMove(event: PointerEvent) {
      if (!dragging.current) return;
      look.current.yaw -= event.movementX * LOOK_SENSITIVITY;
      look.current.pitch = clampNpcFollowPitch(
        look.current.pitch + event.movementY * LOOK_SENSITIVITY,
      );
    }
    function onContextMenu(event: Event) {
      event.preventDefault();
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      look.current.distance = clampNpcFollowDistance(
        look.current.distance + event.deltaY * WHEEL_DISTANCE,
      );
    }
    function onBlur() {
      keys.current.clear();
      dragging.current = false;
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("contextmenu", onContextMenu);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("contextmenu", onContextMenu);
      element.removeEventListener("wheel", onWheel);
    };
  }, [gl]);

  // Priority must stay <= 0. A positive useFrame priority makes R3F skip
  // automatic gl.render, which freezes the city until npcFollow unmounts.
  useFrame((_, delta) => {
    if (!followTarget(runtime, id, size, target.current)) return;
    const dt = Math.min(delta, 0.05);
    const moving = [...keys.current].some((code) => MOVE_KEYS.has(code));
    if (!dragging.current && !moving && !springFromOrbit.current) {
      if (keys.current.has("KeyQ")) look.current.yaw += LOOK_KEY_SPEED * dt;
      if (keys.current.has("KeyE")) look.current.yaw -= LOOK_KEY_SPEED * dt;
    }
    if (!dragging.current && (moving || springFromOrbit.current)) {
      const next = springNpcFollowLook(look.current.yaw, look.current.pitch, dt);
      look.current.yaw = next.lookYaw;
      look.current.pitch = next.lookPitch;
      if (
        Math.abs(look.current.yaw) < 1e-3 &&
        Math.abs(look.current.pitch - NPC_FOLLOW_PITCH) < 1e-3
      ) {
        look.current.yaw = 0;
        look.current.pitch = NPC_FOLLOW_PITCH;
        springFromOrbit.current = false;
      }
    }
    const yaw = followYaw(runtime, id);
    const placed = npcFollowCameraPose(
      target.current,
      yaw,
      look.current.yaw,
      look.current.pitch,
      look.current.distance,
    );
    if (framedForId.current !== frameKey || !followFramingIsValid(placed, target.current)) {
      if (!followFramingIsValid(placed, target.current)) return;
      framedForId.current = frameKey;
    }
    camera.position.set(placed.x, placed.y, placed.z);
    camera.lookAt(target.current);
    camera.updateMatrixWorld();
  });

  return <primitive object={camera} />;
}
