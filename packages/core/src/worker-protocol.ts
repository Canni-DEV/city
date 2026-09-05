import { z } from "zod";
import { CityDocumentSchema, GenerationParametersSchema } from "./domain.js";

const RequestIdSchema = z.string().min(1);
export const GENERATION_STAGES = [
  "mask",
  "districts",
  "graph",
  "routing",
  "tiles",
  "validation",
] as const;
export const GenerationStageSchema = z.enum(GENERATION_STAGES);
export type GenerationStage = z.infer<typeof GenerationStageSchema>;

export const GenerationWorkerRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("generate"),
    requestId: RequestIdSchema,
    name: z.string().trim().min(1).max(80),
    seed: z.string().trim().min(1).max(64),
    parameters: GenerationParametersSchema,
  }),
  z.object({ type: z.literal("cancel"), requestId: RequestIdSchema }),
]);

export const GenerationWorkerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("progress"),
    requestId: RequestIdSchema,
    stage: GenerationStageSchema,
    percent: z.number().min(0).max(100),
    message: z.string().min(1),
  }),
  z.object({ type: z.literal("complete"), requestId: RequestIdSchema, city: CityDocumentSchema }),
  z.object({ type: z.literal("cancelled"), requestId: RequestIdSchema }),
  z.object({
    type: z.literal("error"),
    requestId: RequestIdSchema,
    code: z.string().min(1),
    message: z.string().min(1),
    recoverable: z.boolean(),
  }),
]);

export type GenerationWorkerRequest = z.infer<typeof GenerationWorkerRequestSchema>;
export type GenerationWorkerEvent = z.infer<typeof GenerationWorkerEventSchema>;
