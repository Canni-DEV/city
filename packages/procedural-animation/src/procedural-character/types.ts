export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type LocomotionState = "idle" | "walk" | "run" | "jump" | "crouch";
export type SocialLoop = "talk" | "listen";
export type BeatType = "wave" | "point" | "nod" | "punch" | "kick" | "stagger" | "sidestep";
export type ContactBeat = "punch" | "kick";
export type PointArm = "left" | "right" | "auto";

export interface AttentionIntent {
  target: Vec3;
  weight?: number;
}
export interface AnimationIntent {
  attention?: AttentionIntent;
  loop?: SocialLoop;
  /** Desired world-space body heading. Attention may supply it automatically while idle. */
  facingYaw?: number;
}
export type Beat =
  | { type: "wave" | "nod" | "punch" | "kick" }
  | { type: "point"; target: Vec3; arm?: PointArm }
  | { type: "stagger"; direction: Vec3; intensity: number }
  | { type: "sidestep"; direction: Vec3; distance: number };

export interface BeatHandle {
  accepted: boolean;
  id?: number;
  reason?: "busy" | "airborne" | "physics" | "invalid";
}
export interface ActiveBeat {
  id: number;
  type: BeatType;
}
export interface AnimationStatus {
  locomotion: LocomotionState;
  attention: "neutral" | "tracking";
  loop: SocialLoop | null;
  beat: ActiveBeat | null;
  turning: boolean;
}
export interface CharacterStatus extends AnimationStatus {
  physics: "animated" | "ragdoll" | "gettingUp";
  locomotionBlocked: boolean;
}
export interface MotionRequest {
  translation: Vec3;
  yawDelta: number;
  source: "turn" | "stagger" | "sidestep";
}

export interface MotionSample {
  position: Vec3;
  facingYaw: number;
  velocity: Vec3;
  grounded: boolean;
  crouched?: boolean;
}
export interface GroundHit {
  point: Vec3;
  normal: Vec3;
}
export interface EnvironmentQueries {
  ground(origin: Vec3, distance: number): GroundHit | null;
  clearance(feet: Vec3, height: number, radius: number): boolean;
}
export interface KnockdownHit {
  impulse: Vec3;
  point?: Vec3;
}
export type BeatCancellationReason = "interrupted" | "ragdoll" | "recovery" | "cancelled";
export type CharacterEvent =
  | { type: "beatStarted"; id: number; beat: BeatType }
  | { type: "beatCompleted"; id: number; beat: BeatType }
  | { type: "beatCancelled"; id: number; beat: BeatType; reason: BeatCancellationReason }
  | {
      type: "actionContact";
      id: number;
      beat: ContactBeat;
      origin: Vec3;
      point: Vec3;
      direction: Vec3;
      reach: number;
      radius: number;
      intensity: number;
    }
  | { type: "physicsChanged"; from: CharacterStatus["physics"]; to: CharacterStatus["physics"] }
  | { type: "recoveryBlocked"; reason: "moving" | "noSupport" | "noSpace" }
  | { type: "recoveryCompleted"; position: Vec3; facingYaw: number };

/** Runtime-safe gait controls. Distances are metres and cadence is steps/second. */
export interface AnimatorParameters {
  stepLength: number;
  cadence: number;
  limbSpeed: number;
  footLift: number;
  stanceRatio: number;
}
export interface InteractionParameters {
  attentionResponse: number;
  headYawLimit: number;
  headPitchDown: number;
  headPitchUp: number;
  chestYawLimit: number;
  chestPitchLimit: number;
  turnThreshold: number;
  turnDelay: number;
  turnSpeed: number;
  turnTolerance: number;
  socialFade: number;
  idleShiftMin: number;
  idleShiftMax: number;
  waveDuration: number;
  pointDuration: number;
  nodDuration: number;
  punchDuration: number;
  kickDuration: number;
  staggerDuration: number;
  sidestepDuration: number;
}
export interface AnimationOptions
  extends Partial<AnimatorParameters>,
    Partial<InteractionParameters> {
  height?: number;
  seed?: number;
  style?: number;
  walkSpeed?: number;
  runSpeed?: number;
  queries?: EnvironmentQueries;
}
export interface RagdollOptions {
  mass?: number;
  collisionGroups?: number;
  linearDamping?: number;
  angularDamping?: number;
  jointStiffness?: number;
  jointDamping?: number;
  maxJointTorque?: number;
}
export interface CharacterInput {
  moveX: number;
  moveZ: number;
  run: boolean;
  jump: boolean;
  crouch: boolean;
  ragdollToggle: boolean;
  speed?: number;
}
export const EMPTY_INPUT: CharacterInput = {
  moveX: 0,
  moveZ: 0,
  run: false,
  jump: false,
  crouch: false,
  ragdollToggle: false,
};
export function isHelperBone(name: string): boolean {
  return /Ctrl$|IK|Roll|_end$/.test(name);
}
