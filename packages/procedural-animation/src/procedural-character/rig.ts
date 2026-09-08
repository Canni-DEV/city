import { Box3, type Object3D, Quaternion, Vector3 } from "three";
import type { PoseBinder } from "./pose";

export const SEGMENTS = [
  ["Hips", "Spine", null, 0.075, 0.18, 0.55],
  ["Chest", "Neck", "Hips", 0.08, 0.3, 0.55],
  ["Head", "Head_end", "Chest", 0.068, 0.08, 0.65],
  ["LeftArm", "LeftForeArm", "Chest", 0.028, 0.035, 2.1],
  ["LeftForeArm", "LeftHand", "LeftArm", 0.024, 0.025, 2.5],
  ["RightArm", "RightForeArm", "Chest", 0.028, 0.035, 2.1],
  ["RightForeArm", "RightHand", "RightArm", 0.024, 0.025, 2.5],
  ["LeftUpLeg", "LeftLeg", "Hips", 0.043, 0.075, 1.5],
  ["LeftLeg", "LeftFoot", "LeftUpLeg", 0.033, 0.05, 2.5],
  ["LeftFoot", "LeftToes", "LeftLeg", 0.029, 0.025, 0.65],
  ["RightUpLeg", "RightLeg", "Hips", 0.043, 0.075, 1.5],
  ["RightLeg", "RightFoot", "RightUpLeg", 0.033, 0.05, 2.5],
  ["RightFoot", "RightToes", "RightLeg", 0.029, 0.025, 0.65],
] as const;

/** Calibration in character coordinates; lengths are metres. */
export class RigProfile {
  readonly rest = new Map<string, Vector3>();
  readonly rotation = new Map<string, Quaternion>();
  readonly height: number;
  readonly legLength: number;
  readonly footLift: number;
  constructor(
    readonly pose: PoseBinder,
    readonly root: Object3D,
  ) {
    root.updateWorldMatrix(true, true);
    root.traverse((node) => {
      const s = node.scale;
      if (
        s.x <= 0 ||
        Math.abs(s.x - s.y) > Math.abs(s.x) * 0.001 ||
        Math.abs(s.x - s.z) > Math.abs(s.x) * 0.001
      )
        throw new Error(`Rig requires positive uniform scale: ${node.name}`);
    });
    for (const [bone, child] of SEGMENTS) {
      pose.require(bone);
      pose.require(child);
    }
    for (const [name, node] of pose.nodes) {
      this.rest.set(name, root.worldToLocal(node.getWorldPosition(new Vector3())));
      this.rotation.set(
        name,
        root
          .getWorldQuaternion(new Quaternion())
          .invert()
          .multiply(node.getWorldQuaternion(new Quaternion())),
      );
    }
    this.height = new Box3().setFromObject(root).getSize(new Vector3()).y;
    this.legLength =
      this.point("LeftUpLeg").distanceTo(this.point("LeftLeg")) +
      this.point("LeftLeg").distanceTo(this.point("LeftFoot"));
    this.footLift = Math.max(0.015, Math.min(this.point("LeftFoot").y, this.point("RightFoot").y));
  }
  point(name: string): Vector3 {
    const p = this.rest.get(name);
    if (!p) throw new Error(`Missing rig point: ${name}`);
    return p;
  }
  worldPoint(name: string): Vector3 {
    return this.root.localToWorld(this.point(name).clone());
  }
  rotate(name: string, x: number, y: number, z: number): void {
    const node = this.pose.require(name);
    const q = this.root.getWorldQuaternion(new Quaternion());
    const delta = new Quaternion()
      .setFromAxisAngle(new Vector3(1, 0, 0), x)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), y))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), z));
    this.pose.setWorldQuaternion(
      name,
      q
        .clone()
        .multiply(delta)
        .multiply(q.invert())
        .multiply(node.getWorldQuaternion(new Quaternion())),
    );
  }
  offsetHips(offset: Vector3): void {
    const bone = this.pose.require("Hips");
    const p = bone
      .getWorldPosition(new Vector3())
      .add(offset.clone().applyQuaternion(this.root.getWorldQuaternion(new Quaternion())));
    bone.position.copy(bone.parent!.worldToLocal(p));
    bone.updateWorldMatrix(false, true);
  }
}
