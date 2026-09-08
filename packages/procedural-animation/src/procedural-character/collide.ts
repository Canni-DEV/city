/** Membership / filter bitmasks for Rapier InteractionGroups. */
export const COL_GROUND = 0x0001;
export const COL_CHAR = 0x0002;
export const COL_RAGDOLL = 0x0004;
export const COL_VEHICLE = 0x0008;

export function colGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export const GROUND_GROUPS = colGroups(COL_GROUND, 0xffff);
export const CHAR_GROUPS = colGroups(COL_CHAR, COL_GROUND);
export const VEHICLE_GROUPS = colGroups(COL_VEHICLE, COL_GROUND | COL_RAGDOLL);
export const RAGDOLL_GROUPS = colGroups(COL_RAGDOLL, COL_GROUND | COL_VEHICLE | COL_RAGDOLL);
