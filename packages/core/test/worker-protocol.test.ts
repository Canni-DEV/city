import { describe, expect, it } from "vitest";
import {
  GENERATION_STAGES,
  GenerationWorkerEventSchema,
  GenerationWorkerRequestSchema,
} from "../src/index.js";

describe("M2 generation worker protocol", () => {
  it("FUN-016 accepts land and placement stages, progress, and cancellation messages", () => {
    expect(GENERATION_STAGES).toEqual([
      "mask",
      "districts",
      "graph",
      "routing",
      "tiles",
      "traffic",
      "blocks",
      "sidewalks",
      "lots",
      "zones",
      "placement",
      "decoration",
      "streetFurniture",
      "validation",
    ]);
    expect(GenerationWorkerRequestSchema.parse({ type: "cancel", requestId: "req-1" }).type).toBe(
      "cancel",
    );
    const progress = GenerationWorkerEventSchema.parse({
      type: "progress",
      requestId: "req-1",
      stage: "lots",
      percent: 83,
      message: "Subdividing lots with road frontage",
    });
    expect(progress).toMatchObject({ type: "progress", stage: "lots", percent: 83 });
  });
});
