import { greetNpc, setNpcControlInput, stopNpc } from "@city/core";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { isEditableTarget } from "./keyboard";
import type { SimulationRuntime } from "./simulation-runtime";

const UP = new THREE.Vector3(0, 1, 0);

export function NpcControlInput({ runtime, id }: { runtime: SimulationRuntime; id: string }) {
  const get = useThree((state) => state.get);
  const keys = useRef(new Set<string>());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const movement = useRef(new THREE.Vector3());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      keys.current.add(event.code);
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(event.code)
      ) {
        event.preventDefault();
      }
      if (event.repeat) return;
      if (event.code === "KeyV") greetNpc(runtime.world, id);
      if (event.code === "KeyX") stopNpc(runtime.world, id);
    };
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.code);
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      setNpcControlInput(runtime.world, id, { direction: [0, 0], run: false });
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
    };
  }, [id, runtime]);

  useFrame(() => {
    const camera = get().camera;
    if (![camera.position.x, camera.position.y, camera.position.z].every(Number.isFinite)) return;
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    if (forward.current.lengthSq() < 1e-6) forward.current.set(0, 0, 1);
    forward.current.normalize();
    right.current.crossVectors(forward.current, UP).normalize();
    movement.current.set(0, 0, 0);
    const pressed = keys.current;
    if (pressed.has("KeyW") || pressed.has("ArrowUp")) movement.current.add(forward.current);
    if (pressed.has("KeyS") || pressed.has("ArrowDown")) movement.current.sub(forward.current);
    if (pressed.has("KeyD") || pressed.has("ArrowRight")) movement.current.add(right.current);
    if (pressed.has("KeyA") || pressed.has("ArrowLeft")) movement.current.sub(right.current);
    if (movement.current.lengthSq() > 1) movement.current.normalize();
    setNpcControlInput(runtime.world, id, {
      direction: [movement.current.x, movement.current.z],
      run: pressed.has("ShiftLeft") || pressed.has("ShiftRight"),
    });
  }, -3);

  return null;
}
