import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { isEditableTarget } from "./keyboard";

const LOOK_SENSITIVITY = 0.005;
const MOVE_SPEED = 10;
const FAST_MULTIPLIER = 3.2;
const WHEEL_SPEED = 0.035;
const PITCH_LIMIT = Math.PI / 2 - 0.04;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Unrestricted inspect camera. Default city orbit stays elsewhere (UX-011).
 * WASD strafes, Space/E up, C/Q down, Shift faster, wheel along look, right-drag looks.
 */
export function FreeFlightControls() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const keys = useRef(new Set<string>());
  const dragging = useRef(false);
  const look = useRef({ yaw: 0, pitch: -0.4 });
  const lookEuler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const motion = useRef(new THREE.Vector3());

  useLayoutEffect(() => {
    camera.lookAt(0, 0, 0);
    const aimed = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    look.current.yaw = aimed.y;
    look.current.pitch = aimed.x;
  }, [camera]);

  useEffect(() => {
    const element = gl.domElement;
    element.tabIndex = 0;

    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      keys.current.add(event.code);
      if (
        event.code === "KeyW" ||
        event.code === "KeyA" ||
        event.code === "KeyS" ||
        event.code === "KeyD" ||
        event.code === "KeyQ" ||
        event.code === "KeyE" ||
        event.code === "KeyC" ||
        event.code === "Space"
      ) {
        event.preventDefault();
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      keys.current.delete(event.code);
    }
    function onPointerDown(event: PointerEvent) {
      if (event.button !== 2) return;
      dragging.current = true;
      element.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
    function onPointerUp(event: PointerEvent) {
      if (event.button !== 2) return;
      dragging.current = false;
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    }
    function onPointerMove(event: PointerEvent) {
      if (!dragging.current) return;
      look.current.yaw -= event.movementX * LOOK_SENSITIVITY;
      look.current.pitch -= event.movementY * LOOK_SENSITIVITY;
      look.current.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, look.current.pitch));
    }
    function onContextMenu(event: Event) {
      event.preventDefault();
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      camera.getWorldDirection(forward.current);
      camera.position.addScaledVector(forward.current, -event.deltaY * WHEEL_SPEED);
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
  }, [camera, gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    lookEuler.current.set(look.current.pitch, look.current.yaw, 0);
    camera.quaternion.setFromEuler(lookEuler.current);
    camera.getWorldDirection(forward.current);
    right.current.crossVectors(forward.current, UP).normalize();
    motion.current.set(0, 0, 0);
    const pressed = keys.current;
    if (pressed.has("KeyW")) motion.current.add(forward.current);
    if (pressed.has("KeyS")) motion.current.sub(forward.current);
    if (pressed.has("KeyD")) motion.current.add(right.current);
    if (pressed.has("KeyA")) motion.current.sub(right.current);
    if (pressed.has("Space") || pressed.has("KeyE")) motion.current.y += 1;
    if (pressed.has("KeyC") || pressed.has("KeyQ")) motion.current.y -= 1;
    if (motion.current.lengthSq() > 0) motion.current.normalize();
    const sprint = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
    const speed = MOVE_SPEED * (sprint ? FAST_MULTIPLIER : 1);
    camera.position.addScaledVector(motion.current, speed * dt);
    camera.updateMatrixWorld();
  });

  return null;
}
