import type RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { RAGDOLL_GROUPS } from "./collide";
import { type RigProfile, SEGMENTS } from "./rig";
import type { KnockdownHit, RagdollOptions, Vec3 } from "./types";

type Definition = (typeof SEGMENTS)[number];
interface Part {
  def: Definition;
  body: RAPIER.RigidBody;
  offset: Vector3;
  bindQ: Quaternion;
  joint: RAPIER.ImpulseJoint | null;
  parent?: Part;
  previousP: Vector3;
  previousQ: Quaternion;
  velocity: Vector3;
  angular: Vector3;
}
const vec = (v: Vec3) => new Vector3(v.x, v.y, v.z);
const quat = (q: { x: number; y: number; z: number; w: number }) =>
  new Quaternion(q.x, q.y, q.z, q.w);
export class CharacterRagdoll {
  private parts: Part[] = [];
  private history = new Map<string, { p: Vector3; q: Quaternion; v: Vector3; w: Vector3 }>();
  active = false;
  private quietTime = 0;
  constructor(
    readonly world: RAPIER.World,
    readonly R: typeof RAPIER,
    readonly rig: RigProfile,
    readonly options: RagdollOptions = {},
  ) {
    if ((options.mass ?? 70) <= 0) throw new Error("Ragdoll mass must be positive");
  }
  private transform(def: Definition) {
    const bone = this.rig.pose.require(def[0]);
    const a = bone.getWorldPosition(new Vector3());
    const b = this.rig.pose.require(def[1]).getWorldPosition(new Vector3());
    const q = bone
      .getWorldQuaternion(new Quaternion())
      .multiply(this.rig.rotation.get(def[0])!.clone().invert());
    return { p: a.clone().add(b).multiplyScalar(0.5), q };
  }
  /** Sample actual animated segment velocities before handing authority to physics. */
  captureVelocity(dt: number): void {
    for (const def of SEGMENTS) {
      const { p, q } = this.transform(def);
      const prev = this.history.get(def[0]);
      const v = prev && dt > 0 ? p.clone().sub(prev.p).divideScalar(dt) : new Vector3();
      const w = new Vector3();
      if (prev && dt > 0) {
        const dq = q.clone().multiply(prev.q.clone().invert()).normalize();
        if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
        const angle = 2 * Math.acos(Math.min(1, dq.w));
        w.set(dq.x, dq.y, dq.z);
        if (w.lengthSq() > 1e-12) w.normalize().multiplyScalar(angle / dt);
      }
      this.history.set(def[0], { p, q, v, w });
    }
  }
  activate(hit?: KnockdownHit, fallbackVelocity: Vec3 = { x: 0, y: 0, z: 0 }): void {
    if (this.active) {
      if (hit) this.applyHit(hit);
      return;
    }
    this.active = true;
    this.quietTime = 0;
    if (!this.parts.length) this.create();
    for (const part of this.parts) {
      const { p, q } = this.transform(part.def);
      part.body.setEnabled(true);
      part.body.setTranslation(p, false);
      part.body.setRotation(q, false);
      const history = this.history.get(part.def[0]);
      part.body.setLinvel(history?.v ?? fallbackVelocity, false);
      part.body.setAngvel(history?.w ?? { x: 0, y: 0, z: 0 }, false);
      part.body.wakeUp();
      part.previousP.copy(p);
      part.previousQ.copy(q);
    }
    // Rebuild constraints at matching anatomical anchors, never at centres of mass.
    for (const part of this.parts) {
      if (part.joint) this.world.removeImpulseJoint(part.joint, false);
      part.joint = null;
      if (!part.parent) continue;
      const parent = part.parent;
      const anchor = this.rig.pose.require(part.def[0]).getWorldPosition(new Vector3());
      const a = anchor
        .clone()
        .sub(vec(parent.body.translation()))
        .applyQuaternion(quat(parent.body.rotation()).invert());
      const b = anchor
        .clone()
        .sub(vec(part.body.translation()))
        .applyQuaternion(quat(part.body.rotation()).invert());
      const hinge = /^(Left|Right)(Leg|ForeArm)$/.test(part.def[0]);
      const data = hinge
        ? this.R.JointData.revolute(a, b, { x: 1, y: 0, z: 0 })
        : this.R.JointData.spherical(a, b);
      part.joint = this.world.createImpulseJoint(data, parent.body, part.body, true);
      part.joint.setContactsEnabled(false);
      if (hinge) {
        const relative = quat(parent.body.rotation()).invert().multiply(quat(part.body.rotation()));
        const bend = 2 * Math.atan2(relative.x, relative.w);
        // Knees flex backwards; elbows forward in the canonical character frame.
        const knee = part.def[0].endsWith("Leg");
        (part.joint as RAPIER.RevoluteImpulseJoint).setLimits(
          (knee ? -0.08 : -2.6) - bend,
          (knee ? 2.6 : 0.08) - bend,
        );
      }
    }
    if (hit) this.applyHit(hit);
  }
  private create(): void {
    const h = this.rig.height;
    const massTotal = SEGMENTS.reduce((sum, d) => sum + d[4], 0);
    for (const def of SEGMENTS) {
      const { p, q } = this.transform(def);
      const bone = this.rig.pose.require(def[0]);
      const a = bone.getWorldPosition(new Vector3());
      const b = this.rig.pose.require(def[1]).getWorldPosition(new Vector3());
      const offset = p.clone().sub(a).applyQuaternion(q.clone().invert());
      const direction = b.clone().sub(a).applyQuaternion(q.clone().invert()).normalize();
      const radius = def[3] * h;
      const half = Math.max(0.005 * h, a.distanceTo(b) * 0.5 - radius * 0.65);
      const body = this.world.createRigidBody(
        this.R.RigidBodyDesc.dynamic()
          .setTranslation(p.x, p.y, p.z)
          .setRotation(q)
          .setLinearDamping(this.options.linearDamping ?? 0.12)
          .setAngularDamping(this.options.angularDamping ?? 0.3)
          .setCanSleep(true)
          .setCcdEnabled(true)
          .setAdditionalSolverIterations(4),
      );
      const collider = (
        def[0].endsWith("Foot")
          ? this.R.ColliderDesc.cuboid(h * 0.035, h * 0.025, h * 0.065)
          : this.R.ColliderDesc.capsule(half, radius).setRotation(
              new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction),
            )
      )
        .setMass(((this.options.mass ?? 70) * def[4]) / massTotal)
        .setFriction(0.65)
        .setRestitution(0)
        .setCollisionGroups(this.options.collisionGroups ?? RAGDOLL_GROUPS);
      this.world.createCollider(collider, body);
      this.parts.push({
        def,
        body,
        offset,
        bindQ: this.rig.rotation.get(def[0])!.clone(),
        joint: null,
        previousP: p,
        previousQ: q,
        velocity: new Vector3(),
        angular: new Vector3(),
      });
    }
    for (const p of this.parts) p.parent = this.parts.find((other) => other.def[0] === p.def[2]);
  }
  beforePhysics(dt: number): void {
    if (!this.active) return;
    for (const p of this.parts) {
      p.previousP.copy(p.body.translation());
      p.previousQ.copy(p.body.rotation());
      if (
        !p.parent ||
        /^(Left|Right)(Leg|ForeArm)$/.test(p.def[0]) ||
        (p.body.isSleeping() && p.parent.body.isSleeping())
      )
        continue;
      const parentQ = quat(p.parent.body.rotation());
      const relative = parentQ.clone().invert().multiply(quat(p.body.rotation())).normalize();
      if (relative.w < 0) relative.set(-relative.x, -relative.y, -relative.z, -relative.w);
      const angle = 2 * Math.acos(Math.min(1, relative.w));
      const excess = angle - p.def[5];
      if (excess <= 0) continue;
      const axis = new Vector3(relative.x, relative.y, relative.z)
        .normalize()
        .applyQuaternion(parentQ);
      const relativeSpeed = vec(p.body.angvel()).sub(vec(p.parent.body.angvel())).dot(axis);
      const inertiaA = p.body.principalInertia(),
        inertiaB = p.parent.body.principalInertia();
      const ia = Math.max(1e-6, Math.min(inertiaA.x, inertiaA.y, inertiaA.z));
      const ib = Math.max(1e-6, Math.min(inertiaB.x, inertiaB.y, inertiaB.z));
      const inertia = 1 / (1 / ia + 1 / ib);
      const stiffness = this.options.jointStiffness ?? 100,
        damping = this.options.jointDamping ?? 8;
      // Implicit spring denominator prevents small limbs from receiving explosive angular impulses.
      const torque = Math.max(
        0,
        Math.min(
          this.options.maxJointTorque ?? 65,
          (excess * stiffness + relativeSpeed * damping) /
            (1 + (damping * dt) / inertia + (stiffness * dt * dt) / inertia),
        ),
      );
      const impulse = axis.multiplyScalar(-torque * dt);
      p.body.applyTorqueImpulse(impulse, false);
      p.parent.body.applyTorqueImpulse(impulse.negate(), false);
    }
  }
  afterPhysics(dt: number): void {
    if (!this.active) return;
    // Use surface speed, so a small ankle rotation does not indefinitely block recovery.
    let motionEnergy = 0,
      totalMass = 0;
    const bounded = this.parts.every((p) => vec(p.body.linvel()).length() < 0.5);
    for (const p of this.parts) {
      const mass = p.body.mass(),
        radius = Math.max(p.offset.length(), p.def[3] * this.rig.height);
      motionEnergy +=
        mass *
        (vec(p.body.linvel()).lengthSq() + vec(p.body.angvel()).lengthSq() * radius * radius);
      totalMass += mass;
    }
    const quiet = bounded && motionEnergy / Math.max(1e-6, totalMass) < 0.0225;
    this.quietTime = quiet ? this.quietTime + dt : 0;
    this.applyToBones(1);
  }
  get settled(): boolean {
    return this.active && this.quietTime >= 0.5;
  }
  applyToBones(alpha = 1): void {
    if (!this.parts.length) return;
    const root = this.rig.root;
    this.rig.pose.resetToBind();
    const hips = this.parts[0];
    const q = hips.previousQ.clone().slerp(quat(hips.body.rotation()), alpha);
    const pos = hips.previousP
      .clone()
      .lerp(vec(hips.body.translation()), alpha)
      .sub(hips.offset.clone().applyQuaternion(q));
    // Root remains upright; bones carry all physical orientation.
    root.rotation.set(0, 0, 0);
    root.position.set(0, 0, 0);
    root.updateWorldMatrix(true, true);
    const current = this.rig.pose.require("Hips").getWorldPosition(new Vector3());
    root.position.copy(pos.sub(current));
    root.updateWorldMatrix(true, true);
    for (const p of this.parts) {
      const rotation = p.previousQ.clone().slerp(quat(p.body.rotation()), alpha).multiply(p.bindQ);
      this.rig.pose.setWorldQuaternion(p.def[0], rotation);
    }
    root.updateWorldMatrix(true, true);
  }
  applyHit(hit: KnockdownHit): void {
    if (!this.active) return;
    if (
      ![
        hit.impulse.x,
        hit.impulse.y,
        hit.impulse.z,
        ...(hit.point ? [hit.point.x, hit.point.y, hit.point.z] : []),
      ].every(Number.isFinite)
    )
      throw new Error("Impact must be finite");
    let part = this.parts[0];
    if (hit.point)
      part = this.parts.reduce((best, p) =>
        vec(p.body.translation()).distanceToSquared(vec(hit.point!)) <
        vec(best.body.translation()).distanceToSquared(vec(hit.point!))
          ? p
          : best,
      );
    if (hit.point) part.body.applyImpulseAtPoint(hit.impulse, hit.point, true);
    else part.body.applyImpulse(hit.impulse, true);
    this.quietTime = 0;
  }
  hipsWorld(): Vector3 {
    const p = this.parts[0];
    return p
      ? vec(p.body.translation()).sub(p.offset.clone().applyQuaternion(quat(p.body.rotation())))
      : this.rig.pose.require("Hips").getWorldPosition(new Vector3());
  }
  hipsQuat(): Quaternion {
    return this.parts.length ? quat(this.parts[0].body.rotation()) : new Quaternion();
  }
  deactivate(): void {
    this.active = false;
    for (const p of this.parts) p.body.setEnabled(false);
    this.history.clear();
  }
  dispose(): void {
    for (const p of this.parts) if (p.joint) this.world.removeImpulseJoint(p.joint, false);
    for (const p of this.parts) this.world.removeRigidBody(p.body);
    this.parts = [];
    this.history.clear();
    this.active = false;
  }
  diagnostics(): { bodies: number; maxAnchorError: number; finite: boolean } {
    let maxAnchorError = 0;
    for (const p of this.parts)
      if (p.joint && p.parent) {
        const a = vec(p.joint.anchor1())
          .applyQuaternion(quat(p.parent.body.rotation()))
          .add(vec(p.parent.body.translation()));
        const b = vec(p.joint.anchor2())
          .applyQuaternion(quat(p.body.rotation()))
          .add(vec(p.body.translation()));
        maxAnchorError = Math.max(maxAnchorError, a.distanceTo(b));
      }
    return {
      bodies: this.parts.length,
      maxAnchorError,
      finite: this.parts.every((p) =>
        [
          p.body.translation().x,
          p.body.translation().y,
          p.body.translation().z,
          p.body.rotation().w,
        ].every(Number.isFinite),
      ),
    };
  }
}
