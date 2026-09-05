import type { CityPreset, GenerationParameters } from "./domain.js";
import { GenerationParametersSchema } from "./domain.js";

/** FUN-015: park is a percentage; the other four inputs are relative weights. */
export function normalizeGenerationParameters(input: GenerationParameters): GenerationParameters {
  const parameters = GenerationParametersSchema.parse(input);
  const { park, ...weights } = parameters.zoneMix;
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total === 0) throw new Error("Zone mix: give at least one non-park zone a positive weight.");
  return {
    ...parameters,
    zoneMix: {
      suburban: (weights.suburban / total) * (100 - park),
      urban: (weights.urban / total) * (100 - park),
      commercial: (weights.commercial / total) * (100 - park),
      industrial: (weights.industrial / total) * (100 - park),
      park,
    },
  };
}

export const PRESET_PARAMETERS: Record<CityPreset, GenerationParameters> = {
  balanced: {
    size: 96,
    preset: "balanced",
    density: "medium",
    districtCount: 4,
    roadRegularity: 55,
    roundaboutFrequency: 25,
    decorationDensity: 60,
    zoneMix: { suburban: 35, urban: 25, commercial: 15, industrial: 15, park: 10 },
    colorTheme: "district",
  },
  suburban: {
    size: 96,
    preset: "suburban",
    density: "low",
    districtCount: 3,
    roadRegularity: 40,
    roundaboutFrequency: 35,
    decorationDensity: 80,
    zoneMix: { suburban: 60, urban: 15, commercial: 10, industrial: 5, park: 10 },
    colorTheme: "district",
  },
  "commercial-core": {
    size: 96,
    preset: "commercial-core",
    density: "high",
    districtCount: 4,
    roadRegularity: 70,
    roundaboutFrequency: 20,
    decorationDensity: 70,
    zoneMix: { suburban: 20, urban: 30, commercial: 30, industrial: 10, park: 10 },
    colorTheme: "district",
  },
  "industrial-city": {
    size: 96,
    preset: "industrial-city",
    density: "medium",
    districtCount: 3,
    roadRegularity: 65,
    roundaboutFrequency: 10,
    decorationDensity: 45,
    zoneMix: { suburban: 20, urban: 15, commercial: 10, industrial: 45, park: 10 },
    colorTheme: "district",
  },
};
