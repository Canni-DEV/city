import type RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import { angleDelta } from "./animation";
import { CHAR_GROUPS, COL_GROUND, COL_VEHICLE, colGroups } from "./collide";
import type { CharacterInput, MotionRequest, MotionSample, Vec3 } from "./types";
export class CharacterLocomotion {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
  readonly radius: number;
  private velocity = new Vector3();
  private readonly supportRay: RAPIER.Ray;
  private half: number;
  grounded = false;
  yaw = 0;
  private crouched = false;
  constructor(
    readonly world: RAPIER.World,
    R: typeof RAPIER,
    readonly height: number,
    spawn: Vec3 = { x: 0, y: 0.03, z: 0 },
  ) {
    this.supportRay = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.radius = height * 0.12;
    this.half = height / 2 - this.radius;
    this.body = world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawn.x,
        spawn.y + height / 2,
        spawn.z,
      ),
    );
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(this.half, this.radius).setCollisionGroups(CHAR_GROUPS),
      this.body,
    );
    this.controller = world.createCharacterController(height * 0.008);
    this.controller.enableAutostep(height * 0.19, height * 0.12, false);
    this.controller.enableSnapToGround(height * 0.2);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    this.controller.setMinSlopeSlideAngle(Math.PI / 3);
  }
  beforePhysics(
    dt: number,
    input: CharacterInput,
    locked: boolean,
    canStand = true,
    request?: MotionRequest | null,
  ): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (![input.moveX, input.moveZ, input.speed ?? 0].every(Number.isFinite)) return;
    const crouched = input.crouch || (this.crouched && !canStand);
    if (this.crouched !== crouched) {
      const oldOffset = this.half + this.radius;
      this.crouched = crouched;
      this.half = this.height * (crouched ? 0.31 : 0.5) - this.radius;
      this.collider.setHalfHeight(this.half);
      const p = this.body.translation();
      this.body.setTranslation(
        { x: p.x, y: p.y + this.half + this.radius - oldOffset, z: p.z },
        true,
      );
    }
    const length = Math.hypot(input.moveX, input.moveZ);
    const speed =
      locked || crouched || length < 0.04
        ? 0
        : Math.max(0, input.speed ?? this.height * (input.run ? 2.5 : 0.85));
    const target = new Vector3(
      length ? (input.moveX / length) * speed : 0,
      0,
      length ? (input.moveZ / length) * speed : 0,
    );
    const acceleration = this.height * 4;
    const delta = target
      .sub(new Vector3(this.velocity.x, 0, this.velocity.z))
      .clampLength(0, acceleration * dt);
    this.velocity.x += delta.x;
    this.velocity.z += delta.z;
    if (locked) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    if (speed > 0.01)
      this.yaw += Math.max(
        -dt * 4.5,
        Math.min(dt * 4.5, angleDelta(Math.atan2(input.moveX, input.moveZ), this.yaw)),
      );
    if (this.grounded && input.jump && !locked && !crouched)
      this.velocity.y = Math.sqrt(2 * Math.abs(this.world.gravity.y) * this.height * 0.45);
    this.velocity.y += this.world.gravity.y * dt;
    const desiredMovement = this.velocity.clone().multiplyScalar(dt);
    if (request) {
      desiredMovement.x += request.translation.x;
      desiredMovement.y += request.translation.y;
      desiredMovement.z += request.translation.z;
      this.yaw += request.yawDelta;
    }
    this.controller.computeColliderMovement(this.collider, desiredMovement);
    const movement = this.controller.computedMovement();
    const p = this.body.translation();
    const wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded();
    // Rapier may miss a contact for one tick near its character-controller skin.
    // Verify physical support at the next position; never mask jumps or ledges.
    if (!this.grounded && wasGrounded && this.velocity.y <= 0) {
      const origin = this.supportRay.origin;
      origin.x = p.x + movement.x;
      origin.y = p.y + movement.y - this.half - this.radius + this.height * 0.04;
      origin.z = p.z + movement.z;
      const hit = this.world.castRayAndGetNormal(
        this.supportRay,
        this.height * 0.06,
        false,
        undefined,
        colGroups(0xffff, COL_GROUND | COL_VEHICLE),
        this.collider,
        this.body,
      );
      this.grounded = !!hit && hit.normal.y > 0.65;
    }
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
    this.velocity.x = movement.x / dt;
    this.velocity.z = movement.z / dt;
    this.body.setNextKinematicTranslation({
      x: p.x + movement.x,
      y: p.y + movement.y,
      z: p.z + movement.z,
    });
  }
  sample(): MotionSample {
    const p = this.body.translation();
    return {
      position: { x: p.x, y: p.y - this.half - this.radius, z: p.z },
      facingYaw: this.yaw,
      velocity: this.velocity.clone(),
      grounded: this.grounded,
      crouched: this.crouched,
    };
  }
  snapTo(feet: Vec3, yaw: number): void {
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.crouched = false;
    this.half = this.height / 2 - this.radius;
    this.collider.setHalfHeight(this.half);
    const p = { x: feet.x, y: feet.y + this.height / 2 + 0.02, z: feet.z };
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
  }
  setEnabled(value: boolean): void {
    this.body.setEnabled(value);
  }
  dispose(): void {
    this.world.removeCharacterController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
