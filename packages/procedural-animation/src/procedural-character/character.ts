import { type Object3D, Quaternion, Vector3 } from "three";
import { ProceduralAnimator, smooth } from "./animation";
import { RapierEnvironment } from "./environment";
import { solveTwoBoneIK } from "./ik";
import { loadGltf, prepareCharacterRoot } from "./loader";
import { CharacterLocomotion } from "./locomotion";
import type { CreateCharacterOptions } from "./physics-types";
import { CharacterRagdoll } from "./ragdoll";
import {
  type AnimationIntent,
  type Beat,
  type BeatHandle,
  type CharacterEvent,
  type CharacterInput,
  type CharacterStatus,
  EMPTY_INPUT,
  type KnockdownHit,
  type MotionRequest,
  type MotionSample,
} from "./types";

interface Frame {
  position: Vector3;
  rotation: Quaternion;
  q: Map<string, Quaternion>;
  p: Map<string, Vector3>;
  feet: { position: Vector3; knee: Vector3; rotation: Quaternion }[];
  groundIK: boolean;
}
function frame(): Frame {
  return {
    position: new Vector3(),
    rotation: new Quaternion(),
    q: new Map(),
    p: new Map(),
    feet: [0, 1].map(() => ({
      position: new Vector3(),
      knee: new Vector3(),
      rotation: new Quaternion(),
    })),
    groundIK: false,
  };
}
export class ProceduralCharacter {
  readonly object: Object3D;
  readonly animator: ProceduralAnimator;
  readonly ragdoll: CharacterRagdoll;
  readonly locomotor?: CharacterLocomotion;
  private readonly listeners = new Set<(event: CharacterEvent) => void>();
  private input = { ...EMPTY_INPUT };
  private intent: AnimationIntent = {};
  private motion: MotionSample;
  private mode: "animated" | "ragdoll" | "gettingUp" = "animated";
  private recoveryAge = 0;
  private recoveryFrom = frame();
  private prone = false;
  private previous = frame();
  private current = frame();
  private disposed = false;
  private readonly visualFoot = new Vector3();
  private readonly visualKnee = new Vector3();
  private readonly visualRotation = new Quaternion();
  private constructor(
    private readonly prepared: ReturnType<typeof prepareCharacterRoot>,
    readonly options: CreateCharacterOptions,
  ) {
    this.object = prepared.group;
    const queries = options.queries ?? new RapierEnvironment(options.world, options.rapier);
    this.animator = new ProceduralAnimator(
      this.object,
      prepared.pose,
      { ...options, queries },
      (e) => this.emit(e),
    );
    const h = this.animator.rig.height;
    if (options.movement !== false)
      this.locomotor = new CharacterLocomotion(options.world, options.rapier, h, options.position);
    this.motion = this.locomotor?.sample() ?? {
      position: options.position ?? { x: 0, y: 0, z: 0 },
      facingYaw: 0,
      velocity: { x: 0, y: 0, z: 0 },
      grounded: true,
    };
    this.ragdoll = new CharacterRagdoll(
      options.world,
      options.rapier,
      this.animator.rig,
      options.ragdoll,
    );
    this.animator.update(1 / 60, this.motion);
    this.ragdoll.captureVelocity(0);
    this.capture(this.current);
    this.capture(this.previous);
  }
  static async create(options: CreateCharacterOptions): Promise<ProceduralCharacter> {
    const gltf = await loadGltf(options.gltf);
    const prepared = prepareCharacterRoot(gltf, options.texture, options.height);
    try {
      return new ProceduralCharacter(prepared, options);
    } catch (error) {
      prepared.dispose();
      throw error;
    }
  }
  get status(): CharacterStatus {
    return {
      ...this.animator.status,
      physics: this.mode,
      locomotionBlocked: this.mode !== "animated" || this.animator.locomotionBlocked,
    };
  }
  get grounded(): boolean {
    return this.mode === "animated" && this.motion.grounded;
  }
  get ragdollSettled(): boolean {
    return this.ragdoll.settled;
  }
  get motionRequest(): MotionRequest | null {
    return this.mode === "animated" ? this.animator.motionRequest : null;
  }
  get motionSample(): MotionSample {
    return {
      ...this.motion,
      position: { ...this.motion.position },
      velocity: { ...this.motion.velocity },
    };
  }
  onEvent(listener: (event: CharacterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(event: CharacterEvent): void {
    for (const listener of this.listeners) listener(event);
  }
  setInput(input: CharacterInput): void {
    this.input = { ...input };
  }
  setMotion(motion: MotionSample): void {
    if (
      ![
        motion.position.x,
        motion.position.y,
        motion.position.z,
        motion.facingYaw,
        motion.velocity.x,
        motion.velocity.y,
        motion.velocity.z,
      ].every(Number.isFinite)
    )
      throw new Error("MotionSample must be finite");
    if (this.mode !== "animated") return;
    this.motion = { ...motion, position: { ...motion.position }, velocity: { ...motion.velocity } };
  }
  playBeat(beat: Beat): BeatHandle {
    return this.mode === "animated"
      ? this.animator.playBeat(beat)
      : { accepted: false, reason: "physics" };
  }
  knockdown(hit: KnockdownHit = { impulse: { x: 0, y: 0, z: 0 } }): void {
    this.restore(this.current);
    if (this.mode === "ragdoll") {
      this.ragdoll.applyHit(hit);
      return;
    }
    const from = this.mode;
    this.animator.cancel("ragdoll");
    this.locomotor?.setEnabled(false);
    this.ragdoll.activate(hit, this.motion.velocity);
    this.mode = "ragdoll";
    this.emit({ type: "physicsChanged", from, to: "ragdoll" });
  }
  applyImpulse(hit: KnockdownHit): void {
    this.knockdown(hit);
  }
  requestRecovery(): boolean {
    if (this.mode !== "ragdoll") return false;
    const blocked = (reason: "moving" | "noSupport" | "noSpace") => {
      this.emit({ type: "recoveryBlocked", reason });
      return false;
    };
    if (!this.ragdoll.settled) return blocked("moving");
    const hips = this.ragdoll.hipsWorld(),
      h = this.animator.rig.height;
    const queries = this.animator.options.queries!;
    const hit = queries.ground({ x: hips.x, y: hips.y + h * 0.15, z: hips.z }, h * 0.8);
    if (!hit || hit.normal.y < 0.7) return blocked("noSupport");
    if (!queries.clearance(hit.point, h, h * 0.15)) return blocked("noSpace");
    this.restore(this.current);
    this.capture(this.recoveryFrom);
    const q = this.ragdoll.hipsQuat();
    const forward = new Vector3(0, 0, 1).applyQuaternion(q);
    this.prone = forward.y < 0;
    const up = new Vector3(0, 1, 0).applyQuaternion(q);
    const yaw = Math.atan2(this.prone ? up.x : -up.x, this.prone ? up.z : -up.z);
    this.motion = {
      position: { ...hit.point },
      facingYaw: yaw,
      velocity: { x: 0, y: 0, z: 0 },
      grounded: true,
    };
    this.ragdoll.deactivate();
    this.animator.cancel("recovery");
    this.mode = "gettingUp";
    this.recoveryAge = 0;
    this.emit({ type: "physicsChanged", from: "ragdoll", to: "gettingUp" });
    return true;
  }
  beforePhysics(dt: number, motion?: MotionSample, intent: AnimationIntent = {}): void {
    if (this.disposed) throw new Error("Character has been disposed");
    this.restore(this.current);
    this.intent = this.mode === "animated" ? intent : {};
    if (motion) this.setMotion(motion);
    if (this.mode === "ragdoll") this.ragdoll.beforePhysics(dt);
    else if (this.mode === "animated" && this.locomotor) {
      const h = this.animator.rig.height;
      const canStand = this.animator.options.queries!.clearance(this.motion.position, h, h * 0.12);
      this.locomotor.beforePhysics(
        dt,
        this.input,
        this.animator.locomotionBlocked,
        canStand,
        this.animator.motionRequest,
      );
      this.input.jump = false;
    }
  }
  afterPhysics(dt = 1 / 60): void {
    const swap = this.previous;
    this.previous = this.current;
    this.current = swap;
    if (this.mode === "ragdoll") this.ragdoll.afterPhysics(dt);
    else if (this.mode === "gettingUp") this.recoverPose(dt);
    else {
      if (this.locomotor) this.motion = this.locomotor.sample();
      this.animator.update(dt, this.motion, this.intent);
      this.ragdoll.captureVelocity(dt);
    }
    this.capture(this.current);
    for (const mesh of this.prepared.meshes) mesh.skeleton.update();
  }
  private recoverPose(dt: number): void {
    this.recoveryAge += dt;
    const t = Math.min(1, this.recoveryAge / (this.prone ? 2.2 : 2.5));
    const h = this.animator.rig.height;
    this.animator.update(dt, { ...this.motion, crouched: t < 0.8 });
    // Floor support -> kneeling -> standing. Supine first curls forward; prone pushes up.
    const rise = smooth((t - 0.25) / 0.65);
    this.animator.rig.offsetHips(new Vector3(0, -h * 0.18 * (1 - rise), 0));
    this.animator.rig.rotate("Spine", (this.prone ? 0.5 : -0.2) * (1 - rise), 0, 0);
    for (const side of ["Left", "Right"]) {
      const foot = this.animator.rig.worldPoint(`${side}Foot`);
      this.animator.solveLeg(side, foot);
      if (t < 0.65) {
        const shoulder = this.animator.rig.point(`${side}Arm`);
        const hand = this.object.localToWorld(new Vector3(shoulder.x, h * 0.07, h * 0.24));
        const pole = this.object.localToWorld(new Vector3(shoulder.x * 1.5, h * 0.35, 0));
        this.animator.solveArm(side, hand, pole);
      }
    }
    const target = frame();
    this.capture(target);
    const blend = smooth(t / 0.45);
    this.prepared.pose.lerpSets(
      this.recoveryFrom.q,
      target.q,
      blend,
      this.recoveryFrom.p,
      target.p,
    );
    this.object.position.lerpVectors(this.recoveryFrom.position, target.position, blend);
    this.object.quaternion.copy(this.recoveryFrom.rotation).slerp(target.rotation, blend);
    this.object.updateWorldMatrix(true, true);
    this.ragdoll.captureVelocity(dt);
    if (t >= 1) {
      const queries = this.animator.options.queries!;
      if (!queries.clearance(this.motion.position, h, h * 0.15)) {
        this.capture(this.current);
        this.knockdown();
        this.emit({ type: "recoveryBlocked", reason: "noSpace" });
        return;
      }
      this.mode = "animated";
      this.animator.resetFeet();
      this.locomotor?.snapTo(this.motion.position, this.motion.facingYaw);
      this.locomotor?.setEnabled(true);
      this.emit({ type: "physicsChanged", from: "gettingUp", to: "animated" });
      this.emit({
        type: "recoveryCompleted",
        position: { ...this.motion.position },
        facingYaw: this.motion.facingYaw,
      });
    }
  }
  updateVisual(alpha: number): void {
    const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    this.prepared.pose.lerpSets(
      this.previous.q,
      this.current.q,
      t,
      this.previous.p,
      this.current.p,
    );
    this.object.position.lerpVectors(this.previous.position, this.current.position, t);
    this.object.quaternion.copy(this.previous.rotation).slerp(this.current.rotation, t);
    this.object.updateWorldMatrix(true, true);
    // Local quaternion interpolation alone does not preserve a world-space contact.
    // Reproject the interpolated ankles; simulation frames and anchors remain untouched.
    if (this.mode === "animated" && this.previous.groundIK && this.current.groundIK) {
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? "Left" : "Right";
        const a = this.previous.feet[i],
          b = this.current.feet[i];
        this.visualFoot.lerpVectors(a.position, b.position, t);
        this.visualRotation.copy(a.rotation).slerp(b.rotation, t);
        this.visualKnee.lerpVectors(a.knee, b.knee, t);
        solveTwoBoneIK(
          this.prepared.pose.require(side + "UpLeg"),
          this.prepared.pose.require(side + "Leg"),
          this.prepared.pose.require(side + "Foot"),
          this.visualFoot,
          this.visualKnee,
        );
        this.prepared.pose.setWorldQuaternion(side + "Foot", this.visualRotation);
      }
      this.object.updateWorldMatrix(true, true);
    }
    for (const mesh of this.prepared.meshes) mesh.skeleton.update();
  }
  hipsWorld(): Vector3 {
    return this.ragdoll.hipsWorld();
  }
  private capture(into: Frame): void {
    into.position.copy(this.object.position);
    into.rotation.copy(this.object.quaternion);
    this.prepared.pose.snapshotLocals(into.q, into.p);
    into.groundIK =
      this.mode === "animated" && this.motion.grounded && !this.animator.locomotionBlocked;
    if (into.groundIK)
      for (let i = 0; i < 2; i++) {
        const foot = this.prepared.pose.require(i === 0 ? "LeftFoot" : "RightFoot");
        foot.getWorldPosition(into.feet[i].position);
        foot.getWorldQuaternion(into.feet[i].rotation);
        this.prepared.pose
          .require(i === 0 ? "LeftLeg" : "RightLeg")
          .getWorldPosition(into.feet[i].knee);
      }
  }
  private restore(from: Frame): void {
    this.prepared.pose.lerpSets(from.q, from.q, 1, from.p, from.p);
    this.object.position.copy(from.position);
    this.object.quaternion.copy(from.rotation);
    this.object.updateWorldMatrix(true, true);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ragdoll.dispose();
    this.locomotor?.dispose();
    this.prepared.dispose();
    this.listeners.clear();
    this.object.removeFromParent();
  }
}
export const createProceduralCharacter = (options: CreateCharacterOptions) =>
  ProceduralCharacter.create(options);
