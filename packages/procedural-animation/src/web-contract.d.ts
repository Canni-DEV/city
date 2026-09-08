import type { Object3D, Texture } from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface MotionSample {
  position: Vec3;
  facingYaw: number;
  velocity: Vec3;
  grounded: boolean;
  crouched?: boolean;
}
export interface MotionRequest {
  translation: Vec3;
  yawDelta: number;
  source: "turn" | "stagger" | "sidestep";
}
export interface AnimationIntent {
  attention?: { target: Vec3; weight?: number };
  loop?: "talk" | "listen";
  facingYaw?: number;
}
export interface AnimationStatus {
  locomotion: "idle" | "walk" | "run" | "jump" | "crouch";
  attention: "neutral" | "tracking";
  loop: "talk" | "listen" | null;
  beat: { id: number; type: string } | null;
  turning: boolean;
}
export interface AnimationOptions {
  walkSpeed?: number;
  runSpeed?: number;
  [key: string]: number | undefined | object;
}
export type Beat =
  | { type: "wave" | "nod" | "punch" | "kick" }
  | { type: "point"; target: Vec3; arm?: "left" | "right" | "auto" }
  | { type: "stagger"; direction: Vec3; intensity: number }
  | { type: "sidestep"; direction: Vec3; distance: number };
export interface BeatHandle {
  accepted: boolean;
  id?: number;
  reason?: "busy" | "airborne" | "physics" | "invalid";
}
export interface AnimatedCharacter {
  readonly object: Object3D;
  readonly animator: { readonly rig: { readonly height: number } };
  readonly status: AnimationStatus;
  readonly motionRequest: MotionRequest | null;
  fixedUpdate(dt: number, motion: MotionSample, intent?: AnimationIntent): void;
  playBeat(beat: Beat): BeatHandle;
  updateVisual(alpha: number): void;
  dispose(): void;
}
export function createAnimatedCharacter(options: {
  gltf: GLTF;
  texture?: Texture;
  height: number;
  seed: number;
  animation?: AnimationOptions;
}): AnimatedCharacter;
