import { type Object3D, Quaternion, type Texture, Vector3 } from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { ProceduralAnimator } from "./animation";
import { type PreparedCharacter, prepareCharacterRoot } from "./loader";
import type { PoseBinder } from "./pose";
import type {
  AnimationIntent,
  AnimationOptions,
  AnimationStatus,
  Beat,
  BeatHandle,
  MotionRequest,
  MotionSample,
} from "./types";

interface PoseFrame {
  position: Vector3;
  rotation: Quaternion;
  rotations: Map<string, Quaternion>;
  positions: Map<string, Vector3>;
}

function createFrame(): PoseFrame {
  return {
    position: new Vector3(),
    rotation: new Quaternion(),
    rotations: new Map(),
    positions: new Map(),
  };
}

function capture(prepared: PreparedCharacter, frame: PoseFrame): void {
  frame.position.copy(prepared.group.position);
  frame.rotation.copy(prepared.group.quaternion);
  prepared.pose.snapshotLocals(frame.rotations, frame.positions);
}

function restore(prepared: PreparedCharacter, frame: PoseFrame): void {
  prepared.pose.lerpSets(frame.rotations, frame.rotations, 1, frame.positions, frame.positions);
  prepared.group.position.copy(frame.position);
  prepared.group.quaternion.copy(frame.rotation);
  prepared.group.updateWorldMatrix(true, true);
}

export interface AnimatedCharacter {
  readonly object: Object3D;
  readonly animator: ProceduralAnimator;
  readonly status: AnimationStatus;
  readonly motionRequest: MotionRequest | null;
  fixedUpdate(dt: number, motion: MotionSample, intent?: AnimationIntent): void;
  playBeat(beat: Beat): BeatHandle;
  updateVisual(alpha: number): void;
  dispose(): void;
}

export interface CreateAnimatedCharacterOptions {
  gltf: GLTF;
  texture?: Texture;
  height: number;
  seed: number;
  animation?: AnimationOptions;
}

class AnimatedCharacterImpl implements AnimatedCharacter {
  readonly object: Object3D;
  readonly animator: ProceduralAnimator;
  private readonly previous = createFrame();
  private readonly current = createFrame();
  private disposed = false;

  constructor(
    private readonly prepared: PreparedCharacter,
    options: CreateAnimatedCharacterOptions,
  ) {
    this.object = prepared.group;
    this.animator = new ProceduralAnimator(prepared.group, prepared.pose, {
      ...options.animation,
      seed: options.seed,
      height: options.height,
    });
    capture(prepared, this.previous);
    capture(prepared, this.current);
  }

  get status(): AnimationStatus {
    return this.animator.status;
  }

  get motionRequest(): MotionRequest | null {
    return this.animator.motionRequest;
  }

  fixedUpdate(dt: number, motion: MotionSample, intent: AnimationIntent = {}): void {
    if (this.disposed) throw new Error("AnimatedCharacter has been disposed");
    restore(this.prepared, this.current);
    this.previous.position.copy(this.current.position);
    this.previous.rotation.copy(this.current.rotation);
    this.previous.rotations = new Map(this.current.rotations);
    this.previous.positions = new Map(this.current.positions);
    this.animator.update(dt, motion, intent);
    capture(this.prepared, this.current);
    for (const mesh of this.prepared.meshes) mesh.skeleton.update();
  }

  playBeat(beat: Beat): BeatHandle {
    return this.animator.playBeat(beat);
  }

  updateVisual(alpha: number): void {
    const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    this.prepared.pose.lerpSets(
      this.previous.rotations,
      this.current.rotations,
      t,
      this.previous.positions,
      this.current.positions,
    );
    this.object.position.lerpVectors(this.previous.position, this.current.position, t);
    this.object.quaternion.copy(this.previous.rotation).slerp(this.current.rotation, t);
    this.object.updateWorldMatrix(true, true);
    for (const mesh of this.prepared.meshes) mesh.skeleton.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.prepared.dispose();
    this.object.removeFromParent();
  }
}

export function createAnimatedCharacter(
  options: CreateAnimatedCharacterOptions,
): AnimatedCharacter {
  if (!Number.isFinite(options.height) || options.height <= 0) {
    throw new Error("height must be positive");
  }
  return new AnimatedCharacterImpl(
    prepareCharacterRoot(options.gltf, options.texture, options.height),
    options,
  );
}

export type { PoseBinder };
