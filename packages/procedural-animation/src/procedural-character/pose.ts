import { Euler, type Object3D, Quaternion, type SkinnedMesh, Vector3 } from "three";
import { isHelperBone } from "./types";

const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();

export class PoseBinder {
  readonly nodes = new Map<string, Object3D>();
  readonly bindQuat = new Map<string, Quaternion>();
  readonly bindPos = new Map<string, Vector3>();
  mesh: SkinnedMesh | null = null;

  capture(root: Object3D, mesh: SkinnedMesh): void {
    this.mesh = mesh;
    this.nodes.clear();
    this.bindQuat.clear();
    this.bindPos.clear();
    root.updateWorldMatrix(true, true);
    root.traverse((obj) => {
      if (!obj.name) return;
      this.nodes.set(obj.name, obj);
      this.bindQuat.set(obj.name, obj.quaternion.clone());
      this.bindPos.set(obj.name, obj.position.clone());
    });
  }

  get(name: string): Object3D | undefined {
    return this.nodes.get(name);
  }

  setWorldQuaternion(name: string, q: Quaternion): void {
    const node = this.require(name);
    const parentQ = node.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    node.quaternion.copy(parentQ.invert()).multiply(q).normalize();
    node.updateWorldMatrix(false, true);
  }

  require(name: string): Object3D {
    const n = this.nodes.get(name);
    if (!n) throw new Error(`Hueso no encontrado: ${name}`);
    return n;
  }

  resetToBind(): void {
    for (const [name, node] of this.nodes) {
      const q = this.bindQuat.get(name);
      const p = this.bindPos.get(name);
      if (q) node.quaternion.copy(q);
      if (p) node.position.copy(p);
    }
  }

  /** local = bind * delta */
  applyDelta(name: string, delta: Quaternion): void {
    if (isHelperBone(name) && name !== "HipsCtrl") return;
    const node = this.nodes.get(name);
    const bind = this.bindQuat.get(name);
    if (!node || !bind) return;
    node.quaternion.copy(bind).multiply(delta);
  }

  applyEulerDelta(
    name: string,
    x: number,
    y: number,
    z: number,
    order: Euler["order"] = "XYZ",
  ): void {
    _e.set(x, y, z, order);
    _q.setFromEuler(_e);
    this.applyDelta(name, _q);
  }

  offsetPosition(name: string, x: number, y: number, z: number): void {
    const node = this.nodes.get(name);
    const bind = this.bindPos.get(name);
    if (!node || !bind) return;
    node.position.copy(bind).add(_p.set(x, y, z));
  }

  snapshotLocals(into: Map<string, Quaternion>, intoPos?: Map<string, Vector3>): void {
    for (const [name, node] of this.nodes) {
      const q = into.get(name);
      if (q) q.copy(node.quaternion);
      else into.set(name, node.quaternion.clone());
      if (intoPos) {
        const p = intoPos.get(name);
        if (p) p.copy(node.position);
        else intoPos.set(name, node.position.clone());
      }
    }
  }

  slerpLocals(fromQ: Map<string, Quaternion>, t: number, fromP?: Map<string, Vector3>): void {
    const k = t < 0 ? 0 : t > 1 ? 1 : t;
    for (const [name, node] of this.nodes) {
      const from = fromQ.get(name);
      const bindQ = this.bindQuat.get(name);
      if (!from || !bindQ) continue;
      node.quaternion.copy(from).slerp(bindQ, k);
      if (fromP) {
        const fp = fromP.get(name);
        const bp = this.bindPos.get(name);
        if (fp && bp) node.position.lerpVectors(fp, bp, k);
      }
    }
  }

  lerpSets(
    fromQ: Map<string, Quaternion>,
    toQ: Map<string, Quaternion>,
    t: number,
    fromP?: Map<string, Vector3>,
    toP?: Map<string, Vector3>,
  ): void {
    const k = t < 0 ? 0 : t > 1 ? 1 : t;
    for (const [name, node] of this.nodes) {
      const from = fromQ.get(name);
      const to = toQ.get(name);
      if (!from || !to) continue;
      node.quaternion.copy(from).slerp(to, k);
      if (fromP && toP) {
        const fp = fromP.get(name);
        const tp = toP.get(name);
        if (fp && tp) node.position.lerpVectors(fp, tp, k);
      }
    }
  }
}
