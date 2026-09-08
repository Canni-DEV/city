import { type Object3D, Quaternion, Vector3 } from "three";
import { solveTwoBoneIK } from "./ik";
import { RigProfile } from "./rig";
import type {
  AnimationIntent,
  AnimationOptions,
  AnimationStatus,
  AnimatorParameters,
  Beat,
  BeatCancellationReason,
  BeatHandle,
  BeatType,
  CharacterEvent,
  ContactBeat,
  InteractionParameters,
  LocomotionState,
  MotionRequest,
  MotionSample,
  SocialLoop,
} from "./types";

const TAU = Math.PI * 2;
export const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
interface Foot {
  target: Vector3;
  desired: Vector3;
  normal: Vector3;
  start: Vector3;
  rotation: Quaternion;
  startRotation: Quaternion;
  height: number;
  ready: boolean;
  planted: boolean;
  stance: boolean;
  pending: boolean;
  age: number;
  duration: number;
  lead: number;
  lift: number;
  unsupported: number;
}
interface RunningBeat {
  id: number;
  value: Beat;
  age: number;
  contacted: boolean;
}
export class ProceduralAnimator {
  readonly rig: RigProfile;
  phase = 0;
  style: number;
  readonly targets = new Map<string, Vector3>();
  private time = 0;
  private gaitWeight = 0;
  private gaitSpeed = 0;
  private pelvisDrop = 0;
  private nextFoot = 0;
  private lastSwing = -1;
  private strideReachBlend = 0;
  private strideAcceleration = 0;
  private previousSpeed = 0;
  private previousYaw = 0;
  private lean = 0;
  private turn = 0;
  private locomotion: LocomotionState = "idle";
  private activeBeat: RunningBeat | null = null;
  private nextBeatId = 1;
  private currentLoop: SocialLoop | null = null;
  private loopWeight = 0;
  private attentionWeight = 0;
  private attentionYaw = 0;
  private attentionPitch = 0;
  private saturationAge = 0;
  private turning = false;
  private turnPivot = 0;
  private sidestepLead = -1;
  private readonly sidestepOrigin = new Vector3();
  private request: MotionRequest | null = null;
  private readonly variation: number;
  private readonly gait: AnimatorParameters;
  private readonly interaction: InteractionParameters;
  readonly feet: [Foot, Foot] = [0, 1].map(() => ({
    target: new Vector3(),
    desired: new Vector3(),
    normal: new Vector3(0, 1, 0),
    start: new Vector3(),
    rotation: new Quaternion(),
    startRotation: new Quaternion(),
    height: 0,
    ready: false,
    planted: false,
    stance: false,
    pending: false,
    age: 0,
    duration: 0.2,
    lead: 0,
    lift: 0,
    unsupported: 0,
  })) as [Foot, Foot];
  constructor(
    readonly root: Object3D,
    readonly pose: import("./pose").PoseBinder,
    readonly options: AnimationOptions = {},
    private readonly emit: (event: CharacterEvent) => void = () => {},
  ) {
    this.rig = new RigProfile(pose, root);
    this.style = options.style ?? 0.65;
    this.variation = ((Math.imul(options.seed ?? 1, 1664525) + 1013904223) >>> 0) / 4294967296;
    const identity = this.variation - 0.5;
    this.gait = {
      stepLength: this.rig.legLength * (1.02 + identity * 0.1),
      cadence: 3.2 + identity * 0.24,
      limbSpeed: 1 + identity * 0.14,
      footLift: this.rig.height * (0.055 + identity * 0.008),
      stanceRatio: 0.6 + identity * 0.025,
    };
    this.interaction = {
      attentionResponse: 8,
      headYawLimit: Math.PI / 4,
      headPitchDown: (Math.PI * 25) / 180,
      headPitchUp: Math.PI / 9,
      chestYawLimit: (Math.PI * 25) / 180,
      chestPitchLimit: Math.PI / 18,
      turnThreshold: (Math.PI * 55) / 180,
      turnDelay: 0.2,
      turnSpeed: (Math.PI * 2) / 3,
      turnTolerance: Math.PI / 60,
      socialFade: 0.25,
      idleShiftMin: 3,
      idleShiftMax: 6,
      waveDuration: 2.4,
      pointDuration: 1.2,
      nodDuration: 0.7,
      punchDuration: 0.62,
      kickDuration: 0.88,
      staggerDuration: 0.7,
      sidestepDuration: 0.75,
    };
    this.setParameters(options);
  }
  /** A copy of the currently resolved per-instance gait profile. */
  get parameters(): Readonly<AnimatorParameters> {
    return { ...this.gait };
  }
  get interactionParameters(): Readonly<InteractionParameters> {
    return { ...this.interaction };
  }
  get status(): AnimationStatus {
    return {
      locomotion: this.locomotion,
      attention: this.attentionWeight > 0.01 ? "tracking" : "neutral",
      loop: this.loopWeight > 0.01 ? this.currentLoop : null,
      beat: this.activeBeat ? { id: this.activeBeat.id, type: this.activeBeat.value.type } : null,
      turning: this.turning,
    };
  }
  /** Requested root delta for this update. It is replaced, never accumulated, on the next update. */
  get motionRequest(): MotionRequest | null {
    return this.request ? { ...this.request, translation: { ...this.request.translation } } : null;
  }
  /** Applies a partial profile immediately. Invalid and extreme values are safely bounded. */
  setParameters(parameters: Partial<AnimatorParameters & InteractionParameters>): void {
    const finite = (value: number | undefined, fallback: number, min: number, max: number) =>
      value === undefined || !Number.isFinite(value)
        ? fallback
        : Math.max(min, Math.min(max, value));
    const leg = this.rig.legLength;
    this.gait.stepLength = finite(
      parameters.stepLength,
      this.gait.stepLength,
      leg * 0.3,
      leg * 1.65,
    );
    this.gait.cadence = finite(parameters.cadence, this.gait.cadence, 0.75, 5);
    this.gait.limbSpeed = finite(parameters.limbSpeed, this.gait.limbSpeed, 0.25, 3);
    this.gait.footLift = finite(parameters.footLift, this.gait.footLift, 0, leg * 0.3);
    this.gait.stanceRatio = finite(parameters.stanceRatio, this.gait.stanceRatio, 0.45, 0.78);
    const p = parameters as Partial<InteractionParameters>;
    this.interaction.attentionResponse = finite(
      p.attentionResponse,
      this.interaction.attentionResponse,
      1,
      30,
    );
    this.interaction.headYawLimit = finite(
      p.headYawLimit,
      this.interaction.headYawLimit,
      0,
      Math.PI / 2,
    );
    this.interaction.headPitchDown = finite(
      p.headPitchDown,
      this.interaction.headPitchDown,
      0,
      Math.PI / 3,
    );
    this.interaction.headPitchUp = finite(
      p.headPitchUp,
      this.interaction.headPitchUp,
      0,
      Math.PI / 3,
    );
    this.interaction.chestYawLimit = finite(
      p.chestYawLimit,
      this.interaction.chestYawLimit,
      0,
      Math.PI / 3,
    );
    this.interaction.chestPitchLimit = finite(
      p.chestPitchLimit,
      this.interaction.chestPitchLimit,
      0,
      Math.PI / 4,
    );
    this.interaction.turnThreshold = finite(
      p.turnThreshold,
      this.interaction.turnThreshold,
      Math.PI / 12,
      Math.PI,
    );
    this.interaction.turnDelay = finite(p.turnDelay, this.interaction.turnDelay, 0, 2);
    this.interaction.turnSpeed = finite(
      p.turnSpeed,
      this.interaction.turnSpeed,
      Math.PI / 18,
      Math.PI * 4,
    );
    this.interaction.turnTolerance = finite(
      p.turnTolerance,
      this.interaction.turnTolerance,
      0.001,
      Math.PI / 6,
    );
    this.interaction.socialFade = finite(p.socialFade, this.interaction.socialFade, 0.05, 2);
    this.interaction.idleShiftMin = finite(p.idleShiftMin, this.interaction.idleShiftMin, 0.5, 30);
    this.interaction.idleShiftMax = finite(
      p.idleShiftMax,
      this.interaction.idleShiftMax,
      this.interaction.idleShiftMin,
      60,
    );
    for (const key of [
      "waveDuration",
      "pointDuration",
      "nodDuration",
      "punchDuration",
      "kickDuration",
      "staggerDuration",
      "sidestepDuration",
    ] as const)
      this.interaction[key] = finite(p[key], this.interaction[key], 0.1, 10);
  }
  get locomotionBlocked(): boolean {
    return (
      !!this.activeBeat &&
      ["punch", "kick", "stagger", "sidestep"].includes(this.activeBeat.value.type)
    );
  }
  playBeat(beat: Beat): BeatHandle {
    if (!this.validBeat(beat)) return { accepted: false, reason: "invalid" };
    if (this.locomotion === "jump") return { accepted: false, reason: "airborne" };
    if (this.activeBeat) {
      const incoming = this.priority(beat.type),
        current = this.priority(this.activeBeat.value.type);
      if (incoming <= current) return { accepted: false, reason: "busy" };
      this.cancelBeat("interrupted");
    }
    const running = {
      id: this.nextBeatId++,
      value: this.normalizedBeat(beat),
      age: 0,
      contacted: false,
    };
    this.activeBeat = running;
    this.emit({ type: "beatStarted", id: running.id, beat: running.value.type });
    return { accepted: true, id: running.id };
  }
  cancel(reason: BeatCancellationReason = "cancelled"): void {
    this.cancelBeat(reason);
    this.currentLoop = null;
    this.loopWeight = 0;
    this.attentionWeight = 0;
    this.turning = false;
    this.saturationAge = 0;
    this.sidestepLead = -1;
    this.resetFeet();
  }
  resetFeet(): void {
    this.nextFoot = 0;
    this.lastSwing = -1;
    for (const foot of this.feet) {
      foot.ready = false;
      foot.planted = false;
      foot.pending = false;
      foot.stance = false;
      foot.age = 0;
      foot.unsupported = 0;
    }
  }
  update(dt: number, motion: MotionSample, intent: AnimationIntent = {}): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
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
      return;
    this.request = null;
    this.root.position.copy(motion.position);
    this.root.rotation.set(0, motion.facingYaw, 0);
    this.root.updateWorldMatrix(true, true);
    this.pose.resetToBind();
    this.root.updateWorldMatrix(true, true);
    this.time += dt;
    const h = this.rig.height;
    const speed = Math.hypot(motion.velocity.x, motion.velocity.z);
    const walk = this.options.walkSpeed ?? h * 0.85;
    const run = this.options.runSpeed ?? h * 2.5;
    const response = 7 * this.gait.limbSpeed;
    this.gaitSpeed += (speed - this.gaitSpeed) * (1 - Math.exp(-dt * response));
    const blend = smooth((this.gaitSpeed - walk) / Math.max(0.1, run - walk));
    this.strideReachBlend +=
      (blend - this.strideReachBlend) *
      (1 - Math.exp(-dt * (blend > this.strideReachBlend ? response : response * 0.3)));
    const accel = (speed - this.previousSpeed) / dt;
    this.strideAcceleration +=
      (Math.max(-h * 4, Math.min(h * 4, accel)) - this.strideAcceleration) *
      (1 - Math.exp(-dt * response * 0.75));
    const turn = angleDelta(motion.facingYaw, this.previousYaw) / dt;
    this.lean +=
      (Math.max(-0.16, Math.min(0.22, accel * 0.018)) - this.lean) *
      (1 - Math.exp(-dt * response * 0.75));
    this.turn +=
      (Math.max(-0.2, Math.min(0.2, -turn * speed * 0.035)) - this.turn) *
      (1 - Math.exp(-dt * response * 0.65));
    this.previousSpeed = speed;
    this.previousYaw = motion.facingYaw;
    const moving = speed > 0.015 * h && !this.locomotionBlocked;
    this.gaitWeight += ((moving ? 1 : 0) - this.gaitWeight) * (1 - Math.exp(-dt * response));
    const effectiveStep = this.effectiveStepLength(speed, blend);
    if (motion.grounded)
      this.phase = (this.phase + (moving ? (speed * dt) / (effectiveStep * 2) : 0)) % 1;
    const wave = Math.sin(this.phase * TAU) * this.gaitWeight;
    const alive = this.style * (0.8 + this.variation * 0.3);
    const bob =
      Math.cos(this.phase * TAU * 2) * h * (0.009 + blend * 0.012) * this.gaitWeight +
      Math.sin(this.time * 1.8 + this.variation * TAU) * h * 0.002 * (1 - this.gaitWeight);
    const locomotionDrop = h * (0.032 * this.gaitWeight + this.strideReachBlend * 0.035);
    this.rig.offsetHips(
      new Vector3(
        wave * h * 0.012 * alive,
        -locomotionDrop + bob - (motion.crouched ? h * 0.19 : 0),
        0,
      ),
    );
    this.rig.rotate("Hips", this.lean * 0.3, wave * 0.055 * alive, this.turn * 0.4);
    this.rig.rotate(
      "Spine",
      this.lean + blend * 0.09 + (motion.crouched ? 0.22 : 0),
      -wave * 0.1 * alive,
      this.turn,
    );
    this.rig.rotate("Chest", Math.sin(this.time * 1.8) * 0.012, -wave * 0.035 * alive, 0);
    this.arms(moving ? blend : -1, wave, h);
    this.locomotion = !motion.grounded
      ? "jump"
      : motion.crouched
        ? "crouch"
        : moving
          ? blend > 0.45
            ? "run"
            : "walk"
          : "idle";
    if (!moving || intent.loop || this.currentLoop || this.loopWeight > 0)
      this.applyIdleAndLoop(dt, moving, intent);
    if (intent.attention || intent.facingYaw !== undefined || this.attentionWeight > 0.001)
      this.applyAttention(dt, motion, moving, intent);
    else {
      this.turning = false;
      this.saturationAge = 0;
    }
    if (motion.grounded)
      this.groundFeet(dt, blend, h, motion, Math.max(-4.5, Math.min(4.5, turn)), effectiveStep);
    else {
      this.resetFeet();
      for (const side of ["Left", "Right"]) {
        const p = this.rig.point(`${side}Foot`).clone();
        p.y += h * 0.16;
        p.z += h * 0.09;
        this.solveLeg(side, this.root.localToWorld(p));
      }
    }
    this.applyBeat(dt, motion);
    if (motion.grounded && this.activeBeat) this.correctPlantedFeet(h);
    this.root.updateWorldMatrix(true, true);
  }
  private priority(type: BeatType): number {
    if (type === "stagger") return 4;
    if (type === "punch" || type === "kick") return 3;
    if (type === "sidestep") return 2;
    return 1;
  }
  private validVector(value: { x: number; y: number; z: number }): boolean {
    return [value.x, value.y, value.z].every(Number.isFinite);
  }
  private validBeat(beat: Beat): boolean {
    if (beat.type === "point") return this.validVector(beat.target);
    if (beat.type === "stagger")
      return (
        this.validVector(beat.direction) &&
        Number.isFinite(beat.intensity) &&
        Math.hypot(beat.direction.x, beat.direction.z) > 1e-6
      );
    if (beat.type === "sidestep")
      return (
        this.validVector(beat.direction) &&
        Number.isFinite(beat.distance) &&
        Math.hypot(beat.direction.x, beat.direction.z) > 1e-6
      );
    return true;
  }
  private normalizedBeat(beat: Beat): Beat {
    if (beat.type === "point")
      return { ...beat, target: { ...beat.target }, arm: beat.arm ?? "auto" };
    if (beat.type === "stagger")
      return {
        ...beat,
        direction: { ...beat.direction },
        intensity: Math.max(0, Math.min(1, beat.intensity)),
      };
    if (beat.type === "sidestep")
      return {
        ...beat,
        direction: { ...beat.direction },
        distance: Math.max(
          this.rig.height * 0.1,
          Math.min(this.rig.height * 0.45, Math.abs(beat.distance)),
        ),
      };
    return { ...beat };
  }
  private cancelBeat(reason: BeatCancellationReason): void {
    if (!this.activeBeat) return;
    const { id, value } = this.activeBeat;
    this.activeBeat = null;
    this.sidestepLead = -1;
    this.emit({ type: "beatCancelled", id, beat: value.type, reason });
    this.resetFeet();
  }
  private applyIdleAndLoop(dt: number, moving: boolean, intent: AnimationIntent): void {
    const desired =
      !moving && this.locomotion === "idle" && !this.locomotionBlocked
        ? (intent.loop ?? null)
        : null;
    const rate = Math.min(1, dt / this.interaction.socialFade);
    if (desired !== this.currentLoop) {
      this.loopWeight = Math.max(0, this.loopWeight - rate);
      if (this.loopWeight <= 0) this.currentLoop = desired;
    }
    if (desired && desired === this.currentLoop)
      this.loopWeight = Math.min(1, this.loopWeight + rate);
    if (!this.currentLoop) this.loopWeight = 0;

    const interval =
      this.interaction.idleShiftMin +
      (this.interaction.idleShiftMax - this.interaction.idleShiftMin) * this.variation;
    const shift = Math.sin((this.time * Math.PI) / interval + this.variation * TAU);
    const alive = this.style * (0.7 + this.variation * 0.3);
    const h = this.rig.height;
    if (this.locomotion === "idle" && !this.locomotionBlocked && this.gaitWeight < 0.2) {
      this.rig.offsetHips(new Vector3(shift * h * 0.026 * alive, -Math.abs(shift) * h * 0.01, 0));
      this.rig.rotate("Hips", 0, 0, -shift * 0.04 * alive);
      this.rig.rotate("Spine", 0, 0, shift * 0.028 * alive);
      this.rig.rotate("Chest", 0, 0, -shift * 0.012 * alive);
    }
    if (!this.currentLoop || this.loopWeight <= 0) return;
    if (this.currentLoop === "talk") this.talk(this.loopWeight);
    else this.listen(this.loopWeight, shift);
  }
  private talk(weight: number): void {
    const h = this.rig.height,
      rhythm = 1.4 + this.variation * 0.8;
    const pulse = Math.sin(this.time * TAU * rhythm),
      alternate = Math.sin(this.time * TAU * rhythm * 0.53 + this.variation * TAU);
    this.rig.rotate("Chest", pulse * 0.025 * weight * this.style, alternate * 0.035 * weight, 0);
    this.rig.rotate("Spine", -Math.abs(pulse) * 0.012 * weight, 0, 0);
    for (const side of ["Left", "Right"]) {
      const shoulder = this.rig.point(`${side}Arm`),
        sign = Math.sign(shoulder.x) || (side === "Left" ? 1 : -1);
      const target = new Vector3(
        shoulder.x + sign * h * (0.08 + 0.025 * alternate),
        shoulder.y - h * (0.22 - 0.025 * pulse),
        shoulder.z + h * (0.18 + 0.035 * pulse * sign),
      );
      const pole = new Vector3(
        shoulder.x + sign * h * 0.35,
        shoulder.y - h * 0.16,
        shoulder.z - h * 0.05,
      );
      this.blendArm(
        side,
        this.root.localToWorld(target),
        this.root.localToWorld(pole),
        weight * 0.8,
      );
    }
  }
  private listen(weight: number, shift: number): void {
    const h = this.rig.height;
    const sign = shift >= 0 ? 1 : -1;
    this.rig.offsetHips(new Vector3(sign * h * 0.016 * weight, -h * 0.006 * weight, 0));
    this.rig.rotate("Chest", 0.015 * weight, sign * 0.025 * weight, sign * -0.035 * weight);
    this.rig.rotate("Head", 0.035 * weight, 0, sign * 0.105 * weight);
    for (const side of ["Left", "Right"]) {
      const shoulder = this.rig.point(`${side}Arm`);
      const arm = Math.sign(shoulder.x) || (side === "Left" ? 1 : -1);
      const target = new Vector3(
        shoulder.x + arm * h * 0.05,
        shoulder.y - h * 0.38,
        shoulder.z + h * 0.02,
      );
      const pole = new Vector3(
        shoulder.x + arm * h * 0.22,
        shoulder.y - h * 0.2,
        shoulder.z - h * 0.08,
      );
      this.blendArm(
        side,
        this.root.localToWorld(target),
        this.root.localToWorld(pole),
        weight * 0.7,
      );
    }
  }
  private applyAttention(
    dt: number,
    motion: MotionSample,
    moving: boolean,
    intent: AnimationIntent,
  ): void {
    const valid = intent.attention && this.validVector(intent.attention.target);
    const targetWeight = valid ? Math.max(0, Math.min(1, intent.attention!.weight ?? 1)) : 0;
    const response = 1 - Math.exp(-dt * this.interaction.attentionResponse);
    this.attentionWeight += (targetWeight - this.attentionWeight) * response;
    let rawYaw = 0,
      rawPitch = 0;
    if (valid) {
      const target = intent.attention!.target;
      const dx = target.x - this.root.position.x,
        dz = target.z - this.root.position.z;
      rawYaw = angleDelta(Math.atan2(dx, dz), motion.facingYaw);
      const head = this.pose.require("Head").getWorldPosition(new Vector3());
      rawPitch = -Math.atan2(target.y - head.y, Math.max(0.001, Math.hypot(dx, dz)));
    }
    this.attentionYaw += (rawYaw - this.attentionYaw) * response;
    this.attentionPitch += (rawPitch - this.attentionPitch) * response;
    const chestYaw =
      Math.max(
        -this.interaction.chestYawLimit,
        Math.min(this.interaction.chestYawLimit, this.attentionYaw * 0.38),
      ) * this.attentionWeight;
    const headYaw =
      Math.max(
        -this.interaction.headYawLimit,
        Math.min(this.interaction.headYawLimit, this.attentionYaw - chestYaw),
      ) * this.attentionWeight;
    const chestPitch =
      Math.max(
        -this.interaction.chestPitchLimit,
        Math.min(this.interaction.chestPitchLimit, this.attentionPitch * 0.3),
      ) * this.attentionWeight;
    const headPitch =
      Math.max(
        -this.interaction.headPitchUp,
        Math.min(this.interaction.headPitchDown, this.attentionPitch - chestPitch),
      ) * this.attentionWeight;
    this.rig.rotate("Chest", chestPitch, chestYaw, 0);
    this.rig.rotate("Head", headPitch, headYaw, 0);

    const explicit = Number.isFinite(intent.facingYaw);
    const desiredYaw = explicit
      ? intent.facingYaw!
      : valid
        ? motion.facingYaw + rawYaw
        : motion.facingYaw;
    const error = angleDelta(desiredYaw, motion.facingYaw);
    const saturated = !moving && valid && Math.abs(rawYaw) > this.interaction.turnThreshold;
    this.saturationAge = saturated ? this.saturationAge + dt : 0;
    const wasTurning = this.turning;
    const shouldTurn =
      !moving &&
      !this.locomotionBlocked &&
      Math.abs(error) > this.interaction.turnTolerance &&
      (explicit || wasTurning || this.saturationAge >= this.interaction.turnDelay);
    this.turning = shouldTurn;
    if (!shouldTurn) return;
    if (!wasTurning) this.turnPivot = error >= 0 ? 0 : 1;
    const yawDelta = Math.sign(error) * Math.min(Math.abs(error), this.interaction.turnSpeed * dt);
    const translation = { x: 0, y: 0, z: 0 };
    const pivotFoot = this.feet[this.turnPivot];
    if (pivotFoot.ready && pivotFoot.planted) {
      const dx = motion.position.x - pivotFoot.target.x,
        dz = motion.position.z - pivotFoot.target.z;
      const c = Math.cos(yawDelta),
        s = Math.sin(yawDelta);
      translation.x = pivotFoot.target.x + dx * c + dz * s - motion.position.x;
      translation.z = pivotFoot.target.z - dx * s + dz * c - motion.position.z;
    }
    this.request = { translation, yawDelta, source: "turn" };
    const roll = this.turnPivot === 0 ? 1 : -1;
    this.rig.rotate("Hips", 0, yawDelta * 0.35, roll * 0.015);
    this.rig.rotate("Spine", 0, yawDelta * 0.25, 0);
  }
  private duration(beat: Beat): number {
    switch (beat.type) {
      case "wave":
        return this.interaction.waveDuration;
      case "point":
        return this.interaction.pointDuration;
      case "nod":
        return this.interaction.nodDuration;
      case "punch":
        return this.interaction.punchDuration;
      case "kick":
        return this.interaction.kickDuration;
      case "stagger":
        return this.interaction.staggerDuration * (0.55 + 0.45 * beat.intensity);
      case "sidestep":
        return this.interaction.sidestepDuration;
    }
  }
  private beatLocksFoot(i: number): boolean {
    const beat = this.activeBeat?.value;
    if (!beat) return false;
    if (beat.type === "kick" && i === 1) return true;
    return beat.type === "sidestep" && i === this.sidestepLead && this.sidestepLead >= 0;
  }
  private correctPlantedFeet(h: number): void {
    const beat = this.activeBeat?.value.type;
    if (beat === "stagger" || beat === "sidestep") {
      let reachDrop = 0;
      for (let i = 0; i < 2; i++) {
        if (!this.feet[i].planted || this.beatLocksFoot(i)) continue;
        const side = i === 0 ? "Left" : "Right";
        const hip = this.pose.require(`${side}UpLeg`).getWorldPosition(new Vector3());
        const target = this.feet[i].target;
        const horizontal = Math.hypot(target.x - hip.x, target.z - hip.z);
        const allowedVertical = Math.sqrt(
          Math.max(0, (this.rig.legLength * 0.995) ** 2 - horizontal * horizontal),
        );
        reachDrop = Math.max(reachDrop, hip.y - target.y - allowedVertical);
      }
      if (reachDrop > 0) this.rig.offsetHips(new Vector3(0, -Math.min(h * 0.1, reachDrop), 0));
    }
    for (let i = 0; i < 2; i++) {
      if (!this.feet[i].planted || this.beatLocksFoot(i)) continue;
      const side = i === 0 ? "Left" : "Right";
      this.solveLeg(side, this.feet[i].target, h * 0.025 * this.gaitWeight);
      this.pose.setWorldQuaternion(side + "Foot", this.feet[i].rotation);
    }
  }
  private applyBeat(dt: number, motion: MotionSample): void {
    const running = this.activeBeat;
    if (!running) return;
    const duration = this.duration(running.value),
      previousT = Math.min(1, running.age / duration);
    running.age += dt;
    const t = Math.min(1, running.age / duration),
      beat = running.value;
    switch (beat.type) {
      case "wave":
        this.wave(t);
        break;
      case "point":
        this.point(beat, t);
        break;
      case "nod":
        this.nod(t);
        break;
      case "punch":
      case "kick":
        this.attack(beat.type, t);
        if (!running.contacted && t >= 0.48) {
          running.contacted = true;
          this.contact(running, beat.type);
        }
        break;
      case "stagger":
        this.stagger(beat, previousT, t);
        break;
      case "sidestep":
        this.sidestep(beat, previousT, t, motion);
        break;
    }
    if (t >= 1 && this.activeBeat === running) {
      this.activeBeat = null;
      this.sidestepLead = -1;
      this.emit({ type: "beatCompleted", id: running.id, beat: beat.type });
      if (beat.type === "kick") this.resetFeet();
    }
  }
  private contact(running: RunningBeat, beat: ContactBeat): void {
    const point = this.pose
      .require(beat === "punch" ? "RightHand" : "RightFoot")
      .getWorldPosition(new Vector3());
    const origin = this.pose
      .require(beat === "punch" ? "RightArm" : "RightUpLeg")
      .getWorldPosition(new Vector3());
    const direction = point.clone().sub(origin);
    const reach = direction.length();
    if (reach > 1e-6) direction.divideScalar(reach);
    else direction.set(0, 0, 1).applyQuaternion(this.root.quaternion);
    this.emit({
      type: "actionContact",
      id: running.id,
      beat,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      point: { x: point.x, y: point.y, z: point.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      reach,
      radius: this.rig.height * (beat === "punch" ? 0.075 : 0.09),
      intensity: beat === "punch" ? 0.55 : 0.8,
    });
  }
  private point(beat: Extract<Beat, { type: "point" }>, t: number): void {
    const local = this.root.worldToLocal(new Vector3(beat.target.x, beat.target.y, beat.target.z));
    const selected =
      beat.arm === "left"
        ? "Left"
        : beat.arm === "right"
          ? "Right"
          : local.x >= 0
            ? "Left"
            : "Right";
    const shoulder = this.rig.point(`${selected}Arm`),
      sign = Math.sign(shoulder.x) || (selected === "Left" ? 1 : -1);
    const pole = this.root.localToWorld(
      new Vector3(
        shoulder.x + sign * this.rig.height * 0.25,
        shoulder.y - this.rig.height * 0.12,
        shoulder.z - this.rig.height * 0.12,
      ),
    );
    const weight = smooth(t / 0.2) * (1 - smooth((t - 0.8) / 0.2));
    this.blendArm(selected, new Vector3(beat.target.x, beat.target.y, beat.target.z), pole, weight);
    this.rig.rotate(
      "Chest",
      0,
      Math.max(-0.12, Math.min(0.12, Math.atan2(local.x, Math.max(0.001, local.z)) * 0.2)) * weight,
      0,
    );
  }
  private nod(t: number): void {
    const envelope = smooth(t / 0.15) * (1 - smooth((t - 0.82) / 0.18));
    this.rig.rotate("Head", Math.sin(t * Math.PI * 4) * 0.13 * envelope, 0, 0);
  }
  private stagger(beat: Extract<Beat, { type: "stagger" }>, previousT: number, t: number): void {
    const intensity = beat.intensity,
      envelope = Math.sin(Math.PI * t);
    const direction = new Vector3(beat.direction.x, 0, beat.direction.z).normalize();
    const local = direction.clone().applyAxisAngle(new Vector3(0, 1, 0), -this.root.rotation.y);
    this.rig.rotate("Hips", -0.1 * intensity * envelope, 0, -local.x * 0.16 * intensity * envelope);
    this.rig.rotate(
      "Spine",
      0.22 * intensity * envelope,
      -local.x * 0.12 * intensity * envelope,
      local.x * 0.12 * intensity * envelope,
    );
    this.rig.rotate("Chest", 0.12 * intensity * envelope, 0, local.x * 0.1 * intensity * envelope);
    const distance = this.rig.height * (0.12 + 0.16 * intensity);
    const delta = distance * (smooth(t) - smooth(previousT));
    this.request = {
      translation: { x: direction.x * delta, y: 0, z: direction.z * delta },
      yawDelta: 0,
      source: "stagger",
    };
  }
  private sidestep(
    beat: Extract<Beat, { type: "sidestep" }>,
    previousT: number,
    t: number,
    motion: MotionSample,
  ): void {
    const direction = new Vector3(beat.direction.x, 0, beat.direction.z).normalize();
    const delta = beat.distance * (smooth(t) - smooth(previousT));
    this.request = {
      translation: { x: direction.x * delta, y: 0, z: direction.z * delta },
      yawDelta: 0,
      source: "sidestep",
    };
    const local = direction.clone().applyAxisAngle(new Vector3(0, 1, 0), -this.root.rotation.y);
    const envelope = Math.sin(Math.PI * t);
    this.rig.offsetHips(
      new Vector3(
        local.x * this.rig.height * 0.035 * envelope,
        -this.rig.height * 0.025 * envelope,
        0,
      ),
    );
    this.rig.rotate("Hips", 0, 0, -local.x * 0.08 * envelope);
    if (previousT === 0 || this.sidestepLead < 0) {
      this.sidestepLead = local.x >= 0 ? 0 : 1;
      this.sidestepOrigin.set(motion.position.x, motion.position.y, motion.position.z);
      const foot = this.feet[this.sidestepLead];
      foot.planted = false;
      foot.pending = false;
      foot.start.copy(foot.target);
      foot.startRotation.copy(foot.rotation);
      foot.age = 0;
      foot.duration = this.duration(beat);
      foot.lift = this.gait.footLift;
    }
    const foot = this.feet[this.sidestepLead];
    const accepted = new Vector3(
      motion.position.x - this.sidestepOrigin.x,
      0,
      motion.position.z - this.sidestepOrigin.z,
    );
    foot.desired.copy(foot.start).add(accepted);
    foot.target.lerpVectors(foot.start, foot.desired, smooth(t));
    foot.target.y = foot.start.y + Math.sin(Math.PI * t) ** 2 * foot.lift;
    const side = this.sidestepLead === 0 ? "Left" : "Right";
    this.solveLeg(side, foot.target, this.rig.height * 0.02);
    if (t >= 1) {
      foot.planted = true;
      foot.target.copy(foot.desired);
      foot.target.y = foot.start.y;
    }
  }
  private blendArm(side: string, target: Vector3, pole: Vector3, weight: number): void {
    const arm = this.pose.require(`${side}Arm`),
      forearm = this.pose.require(`${side}ForeArm`);
    const restingArm = arm.quaternion.clone(),
      restingForearm = forearm.quaternion.clone();
    this.solveArm(side, target, pole);
    const solvedArm = arm.quaternion.clone(),
      solvedForearm = forearm.quaternion.clone();
    arm.quaternion.copy(restingArm).slerp(solvedArm, weight);
    forearm.quaternion.copy(restingForearm).slerp(solvedForearm, weight);
    arm.updateWorldMatrix(false, true);
  }
  private effectiveStepLength(speed: number, blend: number): number {
    const preferred = this.gait.stepLength * (1 + blend * 0.58);
    const cadenceLimited = speed / this.gait.cadence;
    return Math.max(
      this.rig.legLength * 0.3,
      Math.min(this.rig.legLength * 1.65, Math.max(preferred, cadenceLimited)),
    );
  }
  private arms(blend: number, wave: number, h: number): void {
    for (const side of ["Left", "Right"]) {
      const shoulder = this.rig.point(`${side}Arm`);
      const sign = Math.sign(shoulder.x) || (side === "Left" ? 1 : -1);
      const len =
        shoulder.distanceTo(this.rig.point(`${side}ForeArm`)) +
        this.rig.point(`${side}ForeArm`).distanceTo(this.rig.point(`${side}Hand`));
      const swing =
        blend < 0
          ? Math.sin(this.time * 1.3 + sign) * h * 0.009
          : -sign * wave * h * (0.095 + blend * 0.06);
      const target = new Vector3(
        shoulder.x + sign * h * 0.025,
        shoulder.y - len * (blend < 0 ? 0.96 : 0.91 - blend * 0.25),
        shoulder.z + swing + h * (blend < 0 ? 0.005 : 0.025),
      );
      const pole = new Vector3(
        shoulder.x + sign * h * 0.14,
        shoulder.y - len * 0.45,
        shoulder.z - h * 0.25,
      );
      this.solveArm(side, this.root.localToWorld(target), this.root.localToWorld(pole));
    }
  }
  private groundFeet(
    dt: number,
    blend: number,
    h: number,
    motion: MotionSample,
    yawRate: number,
    stepLength: number,
  ): void {
    // Running needs a real flight interval. A long running support phase forces
    // the planted leg past its reach and makes both legs perform catch-up steps.
    const duty = Math.max(0.3, Math.min(0.78, this.gait.stanceRatio - blend * 0.22));
    const speed = Math.hypot(motion.velocity.x, motion.velocity.z);
    const velocity = new Vector3(motion.velocity.x, 0, motion.velocity.z);
    const moving = speed > h * 0.015 && !this.locomotionBlocked;
    const terrainResponse = 1 - Math.exp(-dt * 7 * this.gait.limbSpeed);
    const reach = this.rig.legLength * 0.96;
    const stepInterval = stepLength / Math.max(speed, h * 0.08);
    // `phase` spans a full left/right cycle, while stepInterval is the time
    // between opposite contacts. The factor of two keeps swing timing aligned.
    const swingDuration = Math.max(
      0.075,
      Math.min(0.5, (stepInterval * 2 * (1 - duty)) / this.gait.limbSpeed),
    );
    const rotation = this.root.getWorldQuaternion(new Quaternion());
    const up = new Vector3(0, 1, 0);
    let low = 0;
    // A fixed candidate makes simultaneous reach/turn requests independent of loop order.
    const launch = this.turning ? 1 - this.turnPivot : this.nextFoot;
    const previousSwing = this.lastSwing < 0 ? undefined : this.feet[this.lastSwing];
    const separated =
      !previousSwing ||
      previousSwing.planted ||
      previousSwing.age + dt >= previousSwing.duration * 0.72;
    let landed = false;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? "Left" : "Right";
      const foot = this.feet[i];
      if (
        this.activeBeat?.value.type === "sidestep" &&
        i === this.sidestepLead &&
        this.sidestepLead >= 0
      ) {
        low = Math.min(low, foot.height);
        continue;
      }
      const rest = this.rig.point(side + "Foot");
      const hip = this.pose.require(side + "UpLeg").getWorldPosition(new Vector3());
      // The half-cycle offset is the canonical left/right phase relationship.
      const stance = !moving || (this.phase + i * 0.5) % 1 < duty;
      const liftOff = foot.stance && !stance;
      foot.stance = stance;
      const initializing = !foot.ready;
      if (initializing) {
        foot.target.copy(this.root.localToWorld(rest.clone()));
        foot.rotation.copy(rotation).multiply(this.rig.rotation.get(side + "Foot")!);
        foot.startRotation.copy(foot.rotation);
        foot.start.copy(foot.target);
        foot.ready = true;
        foot.planted = true;
      }

      // Reserve time for the alternating handoff before a support reaches its IK limit.
      const horizon = dt + swingDuration * 0.25;
      const dx =
        hip.x + (velocity.x + (hip.z - this.root.position.z) * yawRate) * horizon - foot.target.x;
      const dy = hip.y - foot.target.y;
      const dz =
        hip.z + (velocity.z - (hip.x - this.root.position.x) * yawRate) * horizon - foot.target.z;
      const overReach = dx * dx + dy * dy + dz * dz > reach * reach;
      const facing = rotation.clone().multiply(this.rig.rotation.get(side + "Foot")!);
      const twisted = foot.rotation.angleTo(facing) > 0.65;
      if (this.turning && i === this.turnPivot && foot.planted) {
        foot.rotation
          .slerp(facing, 1 - Math.exp(-dt * this.interaction.attentionResponse))
          .normalize();
        foot.startRotation.copy(foot.rotation);
        foot.pending = overReach || foot.unsupported > 0.05;
      } else {
        const travel = moving || this.turning;
        foot.pending =
          (moving && (foot.pending || liftOff)) ||
          (travel && (overReach || twisted)) ||
          foot.unsupported > 0.05;
      }
      if (foot.planted && foot.pending && i === launch && separated) {
        this.nextFoot = 1 - i;
        this.lastSwing = i;
        foot.pending = false;
        foot.planted = false;
        foot.age = 0;
        const other = this.feet[1 - i];
        const remaining =
          other.ready && !other.planted ? Math.max(0, other.duration - other.age) : 0;
        // Latch duration at lift-off; acceleration cannot let a newer swing overtake
        // the older swing and make both ankles touch down together.
        const nominal = swingDuration;
        foot.duration = Math.max(nominal, remaining + Math.max(dt * 2, nominal * 0.12));
        // Keep touchdown near the support polygon instead of at the extreme
        // reachable point. Root motion supplies the remaining stride travel.
        // Preserve the visible increase in touchdown lead as walk blends into
        // run. A duty-only multiplier shrinks at run speed and can otherwise
        // cancel the longer procedural step.
        foot.lead = Math.min(this.rig.legLength * 0.9, stepLength * (0.4 + blend * 0.18));
        foot.lift = this.gait.footLift * (1 + blend * 0.28);
        foot.start.copy(foot.target);
        foot.startRotation.copy(foot.rotation);
      }

      if (foot.planted) foot.desired.copy(foot.target);
      else {
        foot.age = Math.min(foot.duration, foot.age + dt);
        const remaining = foot.duration - foot.age;
        // Predict from actual movement, which can differ from facing during A/D turns.
        const predictedRotation = new Quaternion()
          .setFromAxisAngle(up, yawRate * remaining)
          .multiply(rotation);
        foot.desired.copy(rest).applyQuaternion(predictedRotation).add(this.root.position);
        foot.desired.addScaledVector(velocity, remaining);
        // Land ahead of the predicted body position. The lead is latched at
        // lift-off, so live profile edits cannot bend an airborne arc.
        const supportTime = (foot.duration * duty) / (1 - duty);
        const lead = Math.max(
          0,
          Math.min(
            this.rig.legLength * 0.8,
            foot.lead + this.strideAcceleration * supportTime * supportTime * 0.1 * blend,
          ),
        );
        if (speed > 1e-6) foot.desired.addScaledVector(velocity, lead / speed);
      }
      if (!foot.planted) {
        // Keep the increased landing lead inside the predicted leg reach.
        const remaining = foot.duration - foot.age;
        const cx = hip.x + velocity.x * remaining;
        const cz = hip.z + velocity.z * remaining;
        const vertical = hip.y - (this.root.position.y + rest.y + foot.height);
        const horizontal = Math.hypot(foot.desired.x - cx, foot.desired.z - cz);
        const limit = Math.sqrt(Math.max(0, (reach * 0.99) ** 2 - vertical * vertical));
        if (horizontal > limit && horizontal > 1e-8) {
          const scale = limit / horizontal;
          foot.desired.x = cx + (foot.desired.x - cx) * scale;
          foot.desired.z = cz + (foot.desired.z - cz) * scale;
        }
      }
      const hit = this.options.queries?.ground(
        { x: foot.desired.x, y: this.root.position.y + rest.y + h * 0.3, z: foot.desired.z },
        h * 0.7,
      );
      const supported =
        !this.options.queries ||
        !!(
          hit &&
          [hit.point.y, hit.normal.x, hit.normal.y, hit.normal.z].every(Number.isFinite) &&
          hit.normal.y > 0.65
        );
      foot.unsupported = supported ? 0 : foot.unsupported + dt;
      const groundY = supported && hit ? hit.point.y : this.root.position.y;
      if (supported) {
        foot.height = groundY - this.root.position.y;
        if (!foot.planted) {
          foot.normal.copy(hit?.normal ?? up).normalize();
          foot.desired.y = groundY + rest.y;
        }
      }
      if (initializing && foot.planted) {
        // Initial contact only. Subsequent contacts retain both position and rotation.
        if (supported) {
          foot.target.y = groundY + rest.y;
          foot.normal.copy(hit?.normal ?? up).normalize();
          foot.rotation.premultiply(new Quaternion().setFromUnitVectors(up, foot.normal));
        }
        foot.age = foot.duration;
      }
      if (!foot.planted) {
        const t = Math.min(1, foot.age / foot.duration);
        const weight = smooth(t);
        foot.target.lerpVectors(foot.start, foot.desired, weight);
        foot.target.y += Math.sin(Math.PI * t) ** 2 * foot.lift;
        const tilt = new Quaternion().setFromUnitVectors(up, foot.normal);
        foot.rotation.copy(foot.startRotation).slerp(tilt.multiply(facing), weight).normalize();
        if (t >= 1 && supported && !landed && hip.distanceToSquared(foot.target) <= reach * reach) {
          foot.planted = true;
          foot.pending = false;
          landed = true;
        }
      }
      low = Math.min(low, foot.height);
    }
    this.pelvisDrop += (Math.max(-h * 0.12, low) * 0.55 - this.pelvisDrop) * terrainResponse;
    this.rig.offsetHips(new Vector3(0, this.pelvisDrop, 0));
    // Keep both planted targets inside the actual two-bone reach after additive
    // torso/hip layers. Lowering the pelvis preserves world anchors; relaxing an
    // ankle target here would create visible foot sliding.
    let reachDrop = 0;
    for (let i = 0; i < 2; i++)
      if (this.feet[i].planted) {
        const side = i === 0 ? "Left" : "Right";
        const hip = this.pose.require(`${side}UpLeg`).getWorldPosition(new Vector3());
        const target = this.feet[i].target;
        const horizontal = Math.hypot(target.x - hip.x, target.z - hip.z);
        const allowedVertical = Math.sqrt(
          Math.max(0, (this.rig.legLength * 0.995) ** 2 - horizontal * horizontal),
        );
        reachDrop = Math.max(reachDrop, hip.y - target.y - allowedVertical);
      }
    if (reachDrop > 0) this.rig.offsetHips(new Vector3(0, -reachDrop, 0));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? "Left" : "Right";
      const foot = this.feet[i];
      const hip = this.pose.require(`${side}UpLeg`).getWorldPosition(new Vector3());
      if (
        foot.planted &&
        hip.distanceTo(foot.target) > this.rig.legLength * 0.999 &&
        this.lastSwing !== i
      ) {
        this.nextFoot = 1 - i;
        this.lastSwing = i;
        foot.planted = false;
        foot.pending = false;
        foot.age = 0;
        const other = this.feet[1 - i];
        const remaining =
          other.ready && !other.planted ? Math.max(0, other.duration - other.age) : 0;
        foot.duration = Math.max(swingDuration, remaining + Math.max(dt * 2, swingDuration * 0.12));
        foot.lead = Math.min(this.rig.legLength * 0.9, stepLength * (0.4 + blend * 0.18));
        foot.lift = this.gait.footLift * (1 + blend * 0.28);
        foot.start.copy(foot.target);
        foot.startRotation.copy(foot.rotation);
      }
      this.solveLeg(side, foot.target, h * 0.025 * this.gaitWeight);
      this.pose.setWorldQuaternion(side + "Foot", foot.rotation);
    }
  }
  solveLeg(side: string, target: Vector3, kneeClearance = 0): void {
    const pole = this.root.worldToLocal(
      this.pose.require(`${side}UpLeg`).getWorldPosition(new Vector3()),
    );
    pole.z += this.rig.height;
    pole.x += Math.sign(this.rig.point(`${side}UpLeg`).x) * kneeClearance;
    solveTwoBoneIK(
      this.pose.require(`${side}UpLeg`),
      this.pose.require(`${side}Leg`),
      this.pose.require(`${side}Foot`),
      target,
      this.root.localToWorld(pole),
    );
    const stored = this.targets.get(`${side}Foot`);
    if (stored) stored.copy(target);
    else this.targets.set(`${side}Foot`, target.clone());
  }
  solveArm(side: string, target: Vector3, pole: Vector3): void {
    solveTwoBoneIK(
      this.pose.require(`${side}Arm`),
      this.pose.require(`${side}ForeArm`),
      this.pose.require(`${side}Hand`),
      target,
      pole,
    );
    this.targets.set(`${side}Hand`, target.clone());
  }
  private wave(t: number): void {
    const h = this.rig.height;
    const shoulder = this.rig.point("RightArm");
    const elbow = this.rig.point("RightForeArm");
    const hand = this.rig.point("RightHand");
    const upper = shoulder.distanceTo(elbow);
    const lower = elbow.distanceTo(hand);
    const right = Math.sign(shoulder.x) || -1;
    const ninetyDegreeReach = Math.sqrt(upper * upper + lower * lower);
    const direction = new Vector3(right * 0.62, 0.78, 0.08).normalize();
    const waveProgress = Math.max(0, Math.min(1, (t - 0.16) / 0.66));
    const waveEnvelope = smooth((t - 0.12) / 0.1) * (1 - smooth((t - 0.76) / 0.1));
    const oscillation = Math.sin(waveProgress * TAU * 3) * h * 0.035 * waveEnvelope;
    const raised = shoulder.clone().addScaledVector(direction, ninetyDegreeReach);
    raised.x += oscillation;
    const pole = new Vector3(
      shoulder.x + right * h * 0.42,
      shoulder.y - h * 0.08,
      shoulder.z + h * 0.14,
    );
    const blendIn = smooth(t / 0.16);
    const blendOut = 1 - smooth((t - 0.82) / 0.18);
    const weight = blendIn * blendOut;
    const arm = this.pose.require("RightArm");
    const forearm = this.pose.require("RightForeArm");
    const restingArm = arm.quaternion.clone();
    const restingForearm = forearm.quaternion.clone();
    this.solveArm("Right", this.root.localToWorld(raised), this.root.localToWorld(pole));
    const raisedArm = arm.quaternion.clone();
    const raisedForearm = forearm.quaternion.clone();
    arm.quaternion.copy(restingArm).slerp(raisedArm, weight);
    forearm.quaternion.copy(restingForearm).slerp(raisedForearm, weight);
    arm.updateWorldMatrix(false, true);
    this.rig.rotate("Chest", 0, right * 0.035 * weight, 0);
  }
  private attack(action: ContactBeat, t: number): void {
    const h = this.rig.height;
    const reach =
      t < 0.28 ? 0 : t < 0.48 ? smooth((t - 0.28) / 0.2) : 1 - smooth((t - 0.55) / 0.45);
    const prep = Math.sin(Math.PI * Math.min(1, t / 0.48));
    this.rig.rotate(
      "Spine",
      action === "kick" ? -0.1 * reach : 0.07 * reach,
      action === "kick" ? 0 : 0.15 * prep - 0.23 * reach,
      0,
    );
    if (action === "punch") {
      const s = this.rig.point("RightArm");
      const p = new Vector3(
        s.x * 0.8,
        s.y - h * 0.06,
        s.z + h * (0.12 + 0.28 * reach - 0.045 * prep),
      );
      const pole = new Vector3(s.x * 1.7, s.y - h * 0.18, s.z - h * 0.15);
      const weight = smooth(t / 0.18) * (1 - smooth((t - 0.72) / 0.28));
      const idleHand = this.pose.require("RightHand").getWorldPosition(new Vector3());
      this.solveArm(
        "Right",
        idleHand.lerp(this.root.localToWorld(p), weight),
        this.root.localToWorld(pole),
      );
    } else {
      const thigh = this.pose.require("RightUpLeg");
      const shin = this.pose.require("RightLeg");
      const foot = this.pose.require("RightFoot");
      const supportPose = this.root.worldToLocal(foot.getWorldPosition(new Vector3()));
      const hip = this.root.worldToLocal(thigh.getWorldPosition(new Vector3()));
      const length = this.rig.legLength;
      const side = Math.sign(this.rig.point("RightUpLeg").x);
      const lane = hip.x + side * h * 0.012;
      const chamber = new Vector3(lane, hip.y - length * 0.4, hip.z + length * 0.24);
      const extended = new Vector3(lane, hip.y + length * 0.1, hip.z + length * 0.88);
      const p = new Vector3();
      if (t < 0.28) p.lerpVectors(supportPose, chamber, smooth(t / 0.28));
      else if (t < 0.48) p.lerpVectors(chamber, extended, smooth((t - 0.28) / 0.2));
      else if (t < 0.56) p.copy(extended);
      else if (t < 0.78) p.lerpVectors(extended, chamber, smooth((t - 0.56) / 0.22));
      else p.lerpVectors(chamber, supportPose, smooth((t - 0.78) / 0.22));

      // Solve from bind, not the already twisted walking leg. The knee pole stays
      // above AND ahead of the hip, away from the forward-reaching singularity.
      thigh.quaternion.copy(this.pose.bindQuat.get("RightUpLeg")!);
      shin.quaternion.copy(this.pose.bindQuat.get("RightLeg")!);
      thigh.updateWorldMatrix(true, true);
      const pole = hip.clone().add(new Vector3(side * h * 0.015, h * 0.8, h * 0.65));
      const target = this.root.localToWorld(p);
      solveTwoBoneIK(thigh, shin, foot, target, this.root.localToWorld(pole));
      const stored = this.targets.get("RightFoot");
      if (stored) stored.copy(target);
      else this.targets.set("RightFoot", target.clone());
      this.pose.setWorldQuaternion(
        "RightFoot",
        this.root
          .getWorldQuaternion(new Quaternion())
          .multiply(this.rig.rotation.get("RightFoot")!),
      );
    }
  }
}
