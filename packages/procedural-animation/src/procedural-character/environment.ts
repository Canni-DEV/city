import type RAPIER from "@dimforge/rapier3d-compat";
import { COL_GROUND, COL_VEHICLE, colGroups } from "./collide";
import type { EnvironmentQueries, Vec3 } from "./types";
export class RapierEnvironment implements EnvironmentQueries {
  constructor(
    readonly world: RAPIER.World,
    readonly R: typeof RAPIER,
    readonly groups = colGroups(0xffff, COL_GROUND | COL_VEHICLE),
  ) {}
  ground(origin: Vec3, distance: number) {
    const hit = this.world.castRayAndGetNormal(
      new this.R.Ray(origin, { x: 0, y: -1, z: 0 }),
      distance,
      false,
      undefined,
      this.groups,
    );
    return hit
      ? { point: { x: origin.x, y: origin.y - hit.timeOfImpact, z: origin.z }, normal: hit.normal }
      : null;
  }
  clearance(feet: Vec3, height: number, radius: number): boolean {
    const half = Math.max(0.01, height / 2 - radius);
    return !this.world.intersectionWithShape(
      { x: feet.x, y: feet.y + height / 2 + 0.025, z: feet.z },
      { x: 0, y: 0, z: 0, w: 1 },
      new this.R.Capsule(half, radius),
      undefined,
      this.groups,
    );
  }
}
