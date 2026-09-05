import { z } from "zod";

export const MAP_SIZES = [64, 96, 128] as const;
export const ZONE_TYPES = ["suburban", "urban", "commercial", "industrial", "park"] as const;
export const DENSITY_LEVELS = ["low", "medium", "high"] as const;
export const CITY_PRESETS = ["balanced", "suburban", "commercial-core", "industrial-city"] as const;

export const MapSizeSchema = z.union([z.literal(64), z.literal(96), z.literal(128)]);
export const ZoneTypeSchema = z.enum(ZONE_TYPES);
export const DensityLevelSchema = z.enum(DENSITY_LEVELS);
export const CityPresetSchema = z.enum(CITY_PRESETS);
export const RendererBackendSchema = z.enum(["webgpu", "webgl2"]);
export const EntityOriginSchema = z.enum(["procedural", "user"]);
export const EntityEditStateSchema = z.enum(["generated", "modified", "added"]);

export type MapSize = z.infer<typeof MapSizeSchema>;
export type ZoneType = z.infer<typeof ZoneTypeSchema>;
export type DensityLevel = z.infer<typeof DensityLevelSchema>;
export type CityPreset = z.infer<typeof CityPresetSchema>;
export type RendererBackend = z.infer<typeof RendererBackendSchema>;
export type EntityOrigin = z.infer<typeof EntityOriginSchema>;
export type EntityEditState = z.infer<typeof EntityEditStateSchema>;

const Vector2Schema = z.tuple([z.number(), z.number()]);
const Vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const TransformSchema = z.object({
  position: Vector3Schema,
  rotation: Vector3Schema,
  scale: Vector3Schema,
});

export const FootprintSchema = z.object({
  width: z.number().positive(),
  depth: z.number().positive(),
  clearance: z.number().nonnegative(),
});

export const ZoneMixSchema = z.object({
  suburban: z.number().min(0).max(100),
  urban: z.number().min(0).max(100),
  commercial: z.number().min(0).max(100),
  industrial: z.number().min(0).max(100),
  park: z.number().min(0).max(25),
});

export const GenerationParametersSchema = z.object({
  size: MapSizeSchema,
  preset: CityPresetSchema,
  density: DensityLevelSchema,
  districtCount: z.number().int().min(2).max(8),
  roadRegularity: z.number().min(0).max(100),
  roundaboutFrequency: z.number().min(0).max(100),
  decorationDensity: z.number().min(0).max(100),
  zoneMix: ZoneMixSchema,
  colorTheme: z.string().min(1).max(64),
});

export type GenerationParameters = z.infer<typeof GenerationParametersSchema>;

const RoadNodeSchema = z.object({
  id: z.string().min(1),
  position: Vector2Schema,
  kind: z.enum(["gate", "district", "junction"]),
});

const RoadEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  cells: z.array(Vector2Schema),
  roadClass: z.enum(["arterial", "collector", "local"]),
});

const RoadCellSchema = z.object({
  id: z.string().min(1),
  position: Vector2Schema,
  assetId: z.string().min(1),
  rotation: z.number(),
});

const SidewalkCellSchema = z.object({
  id: z.string().min(1),
  blockId: z.string().min(1),
  position: Vector2Schema,
  assetId: z.string().min(1),
  rotation: z.number(),
});

const DistrictSchema = z.object({
  id: z.string().min(1),
  center: Vector2Schema,
  theme: z.string().min(1),
});

const BlockSchema = z.object({
  id: z.string().min(1),
  districtId: z.string().min(1),
  zone: ZoneTypeSchema,
  cells: z.array(Vector2Schema).min(1),
  regenerationIndex: z.number().int().nonnegative(),
});

const LotSchema = z.object({
  id: z.string().min(1),
  blockId: z.string().min(1),
  cells: z.array(Vector2Schema).min(1),
  frontage: z.enum(["north", "east", "south", "west"]),
});

export const CityEntitySchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  districtId: z.string().nullable(),
  blockId: z.string().nullable(),
  lotId: z.string().nullable(),
  zone: ZoneTypeSchema.nullable(),
  transform: TransformSchema,
  footprint: FootprintSchema,
  origin: EntityOriginSchema,
  editState: EntityEditStateSchema,
  zoneCompatibilityWarning: z.boolean(),
});

export type CityEntity = z.infer<typeof CityEntitySchema>;

export const CityDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  generator: z.object({
    version: z.string().min(1),
    seed: z.string().trim().min(1).max(64),
    attempt: z.number().int().min(0).max(2),
    parameters: GenerationParametersSchema,
  }),
  map: z.object({
    size: MapSizeSchema,
    cellSize: z.literal(1),
    boundaryMask: z.array(z.boolean()),
    densityField: z.array(z.number().min(0).max(1)),
  }),
  districts: z.array(DistrictSchema),
  roadGraph: z.object({
    nodes: z.array(RoadNodeSchema),
    edges: z.array(RoadEdgeSchema),
    cells: z.array(RoadCellSchema),
  }),
  sidewalks: z.array(SidewalkCellSchema),
  blocks: z.array(BlockSchema),
  lots: z.array(LotSchema),
  entities: z.record(z.string(), CityEntitySchema),
});

export type CityDocumentV1 = z.infer<typeof CityDocumentSchema>;

export function createEmptyCityDocument(input: {
  id: string;
  name: string;
  seed: string;
  parameters: GenerationParameters;
  timestamp: string;
}): CityDocumentV1 {
  const document: CityDocumentV1 = {
    schemaVersion: 1,
    id: input.id,
    name: input.name,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
    generator: {
      version: "0.1.0",
      seed: input.seed,
      attempt: 0,
      parameters: input.parameters,
    },
    map: {
      size: input.parameters.size,
      cellSize: 1,
      boundaryMask: Array.from({ length: input.parameters.size ** 2 }, () => false),
      densityField: Array.from({ length: input.parameters.size ** 2 }, () => 0),
    },
    districts: [],
    roadGraph: { nodes: [], edges: [], cells: [] },
    sidewalks: [],
    blocks: [],
    lots: [],
    entities: {},
  };
  return CityDocumentSchema.parse(document);
}
