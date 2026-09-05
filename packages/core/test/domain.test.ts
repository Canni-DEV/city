import { describe, expect, it } from "vitest";
import { CityDocumentSchema, createEmptyCityDocument, PRESET_PARAMETERS } from "../src";

describe("CityDocumentV1", () => {
  it("creates a schema-valid empty document", () => {
    const city = createEmptyCityDocument({
      id: "city_test",
      name: "Test City",
      seed: "m0-seed",
      parameters: PRESET_PARAMETERS.balanced,
      timestamp: "2026-09-04T12:00:00.000Z",
    });
    expect(CityDocumentSchema.parse(city)).toEqual(city);
    expect(city.map.boundaryMask).toHaveLength(96 * 96);
  });
});
