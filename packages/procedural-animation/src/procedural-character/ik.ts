import { Matrix4, type Object3D, Quaternion, Vector3 } from "three";

const _pA = new Vector3();
const _pB = new Vector3();
const _pC = new Vector3();
const _target = new Vector3();
const _pole = new Vector3();
const _dir = new Vector3();
const _n = new Vector3();
const _bend = new Vector3();
const _bDes = new Vector3();
const _desired = new Vector3();
const _currentDir = new Vector3();
const _parentQ = new Quaternion();
const _worldQ = new Quaternion();
const _delta = new Quaternion();
const _inv = new Quaternion();
const _rot = new Matrix4();

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

function childWorldDir(
  bone: Object3D,
  origin: Vector3,
  out: Vector3,
  childOverride?: Object3D,
): boolean {
  const child =
    childOverride ??
    bone.children.find((c) => c.name && !/Ctrl|IK|Roll|_end$/.test(c.name)) ??
    bone.children[0];
  if (!child) return false;
  child.updateWorldMatrix(true, false);
  out.setFromMatrixPosition(child.matrixWorld).sub(origin);
  if (out.lengthSq() < 1e-10) return false;
  out.normalize();
  return true;
}

/** Rota el hueso desde su pose actual para que el eje apunte al target (no pisa el bind). */
function aimBone(bone: Object3D, worldTarget: Vector3, child?: Object3D): void {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  bone.updateWorldMatrix(true, false);
  _pA.setFromMatrixPosition(bone.matrixWorld);
  _desired.copy(worldTarget).sub(_pA);
  if (_desired.lengthSq() < 1e-10) return;
  _desired.normalize();

  if (!childWorldDir(bone, _pA, _currentDir, child)) return;
  if (_currentDir.dot(_desired) > 1 - 1e-12) return;

  _delta.setFromUnitVectors(_currentDir, _desired);
  _worldQ.setFromRotationMatrix(_rot.extractRotation(bone.matrixWorld));
  _worldQ.premultiply(_delta);
  _parentQ.setFromRotationMatrix(_rot.extractRotation(parent.matrixWorld));
  bone.quaternion.copy(_inv.copy(_parentQ).invert()).multiply(_worldQ).normalize();
}

export function aimBoneTowards(bone: Object3D, worldTarget: Vector3): void {
  aimBone(bone, worldTarget);
}

export function solveTwoBoneIK(
  root: Object3D,
  mid: Object3D,
  tip: Object3D,
  targetWorld: Vector3,
  poleWorld: Vector3,
): void {
  if (
    ![targetWorld.x, targetWorld.y, targetWorld.z, poleWorld.x, poleWorld.y, poleWorld.z].every(
      Number.isFinite,
    )
  )
    return;
  root.updateWorldMatrix(true, false);
  mid.updateWorldMatrix(true, false);
  tip.updateWorldMatrix(true, false);

  _pA.setFromMatrixPosition(root.matrixWorld);
  _pB.setFromMatrixPosition(mid.matrixWorld);
  _pC.setFromMatrixPosition(tip.matrixWorld);

  const len1 = _pA.distanceTo(_pB);
  const len2 = _pB.distanceTo(_pC);
  if (!Number.isFinite(len1 + len2) || len1 < 1e-5 || len2 < 1e-5) return;

  _target.copy(targetWorld);
  _dir.copy(_target).sub(_pA);
  let dist = _dir.length();
  // Three 0.185 preserves the imported Kenney legs closer to full extension.
  // Keep a small singularity margin without pulling a planted ankle visibly off target.
  const maxd = (len1 + len2) * 0.999;
  const mind = Math.min(maxd, Math.abs(len1 - len2) + (len1 + len2) * 0.03);
  dist = clamp(dist, mind, maxd);
  if (_dir.lengthSq() < 1e-10) _dir.set(0, -1, 0);
  _dir.normalize();
  _target.copy(_pA).addScaledVector(_dir, dist);

  _pole.copy(poleWorld).sub(_pA);
  _n.crossVectors(_dir, _pole);
  if (_n.lengthSq() < 1e-8) {
    _bend.copy(_pB).sub(_pA);
    _n.crossVectors(_dir, _bend);
    if (_n.lengthSq() < 1e-8) {
      _n.set(0, 1, 0).cross(_dir);
      if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0).cross(_dir);
    }
  }
  _n.normalize();
  _bend.crossVectors(_n, _dir).normalize();
  if (_bend.dot(_pole) < 0) _bend.negate();

  const cosA = clamp((len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _bDes
    .copy(_pA)
    .addScaledVector(_dir, cosA * len1)
    .addScaledVector(_bend, sinA * len1);

  aimBone(root, _bDes, mid);
  root.updateWorldMatrix(true, false);
  mid.updateWorldMatrix(true, false);
  aimBone(mid, _target, tip);
}
