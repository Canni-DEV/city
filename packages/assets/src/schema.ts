import { z } from "zod";

// Kept structurally identical to the public core contract while this package remains build-isolated.
const CompatibleZoneSchema = z.enum(["suburban", "urban", "commercial", "industrial", "park"]);

export const CITY_KIT_PACKS = ["commercial", "industrial", "roads", "suburban"] as const;
export const AssetPackSchema = z.enum([...CITY_KIT_PACKS, "protagonists", "cars"]);
export const AssetCategorySchema = z.enum([
  "building",
  "lod",
  "road",
  "road-structure",
  "street-furniture",
  "vegetation",
  "decoration",
  "infrastructure",
  "terrain",
  "character",
  "animation",
  "vehicle",
]);
export const DirectionSchema = z.enum(["north", "east", "south", "west"]);
export const FrontSchema = z.enum([
  "north",
  "east",
  "south",
  "west",
  "omnidirectional",
  "not-applicable",
]);

export const AssetCatalogEntrySchema = z.object({
  id: z.string().min(1),
  pack: AssetPackSchema,
  model: z.string().min(1),
  sourceFile: z.string().min(1),
  runtimePath: z.string().min(1),
  previewFile: z.string().min(1),
  texturePaths: z.array(z.string().min(1)).min(1),
  category: AssetCategorySchema,
  subcategory: z.string().min(1),
  dimensions: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  footprint: z.object({ width: z.number().positive(), depth: z.number().positive() }),
  verticalOffset: z.number(),
  front: FrontSchema,
  allowedRotations: z.union([z.literal("free"), z.array(z.number()).min(1)]),
  compatibleZones: z.array(CompatibleZoneSchema),
  proceduralWeight: z.number().nonnegative(),
  connectors: z.array(DirectionSchema),
  instancing: z.boolean(),
  lodModelId: z.string().nullable(),
  decoration: z.boolean(),
  elevated: z.boolean(),
  availableInV1: z.boolean(),
  review: z.enum(["heuristic", "override"]),
  uniformScale: z.number().positive().optional(),
  vehicleBounds: z
    .object({ min: z.tuple([z.number(), z.number()]), max: z.tuple([z.number(), z.number()]) })
    .optional(),
  driveProfile: z
    .object({
      surfaceHeight: z.number(),
      ports: z.array(
        z.object({ position: z.tuple([z.number(), z.number()]), direction: DirectionSchema }),
      ),
      curveCenter: z.tuple([z.number(), z.number()]).optional(),
      triangles: z
        .array(
          z.tuple([
            z.tuple([z.number(), z.number()]),
            z.tuple([z.number(), z.number()]),
            z.tuple([z.number(), z.number()]),
          ]),
        )
        .min(1),
    })
    .optional(),
});

export const CITY_KIT_ENTRY_COUNT = 213;
export const CAR_KIT_MODELS = [
  "sedan",
  "sedan-sports",
  "hatchback-sports",
  "suv",
  "suv-luxury",
  "taxi",
  "van",
  "police",
  "ambulance",
  "firetruck",
  "garbage-truck",
] as const;
export const CAR_KIT_ENTRY_COUNT = CAR_KIT_MODELS.length;

export const AssetCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  sourceDigest: z.string().min(1),
  entries: z.array(AssetCatalogEntrySchema).min(CITY_KIT_ENTRY_COUNT),
});

export type AssetCatalogEntry = z.infer<typeof AssetCatalogEntrySchema>;
export type AssetCatalog = z.infer<typeof AssetCatalogSchema>;
