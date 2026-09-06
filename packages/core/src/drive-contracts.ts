import { z } from "zod";
import type { Cardinal, Point } from "./road-tiles.js";

const PointSchema = z.tuple([z.number().finite(), z.number().finite()]);
const DirectionSchema = z.enum(["north", "east", "south", "west"]);
export const RoadTopologySchema = z.object({
  version: z.literal(1),
  sections: z.array(
    z.object({
      id: z.string(),
      tileIds: z.array(z.string()),
      kind: z.enum(["street", "junction", "curve", "roundabout", "terminal"]),
      roadClass: z.enum(["local", "collector", "arterial"]),
    }),
  ),
  ports: z.array(
    z.object({
      id: z.string(),
      sectionId: z.string(),
      position: PointSchema,
      direction: DirectionSchema,
      inbound: z.boolean(),
      outbound: z.boolean(),
      offset: z.number(),
      peerId: z.string().nullable(),
    }),
  ),
  movements: z.array(
    z.object({ id: z.string(), sectionId: z.string(), from: z.string(), to: z.string() }),
  ),
  lanePairs: z.array(z.tuple([z.string(), z.string()])),
  portals: z.array(z.object({ id: z.string(), gateId: z.string(), portIds: z.array(z.string()) })),
});
export type RoadTopology = z.infer<typeof RoadTopologySchema>;
export type RoadPort = RoadTopology["ports"][number];

export interface DriveProfile {
  surfaceHeight: number;
  ports: { position: Point; direction: Cardinal }[];
  curveCenter?: Point;
  triangles: [Point, Point, Point][];
}
export interface VehicleBounds {
  min: Point;
  max: Point;
}
export interface DriveAsset {
  id: string;
  driveProfile?: DriveProfile;
  vehicleBounds?: VehicleBounds;
  uniformScale?: number;
}

/** SIM-017: this is numerical tolerance, not permission to mount a curb. */
export const DRIVE_TOLERANCE = 0.001;
export const DRIVE_LANE_OFFSET = 0.16;

export function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}
