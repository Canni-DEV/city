import { DENSITY_LEVELS, type GenerationParameters, ZONE_TYPES } from "@city/core";

export function GenerationControls({
  parameters,
  onChange,
}: {
  parameters: GenerationParameters;
  onChange: (parameters: GenerationParameters) => void;
}) {
  return (
    <details className="advanced-controls">
      <summary>Advanced controls</summary>
      <p>Zone weights share the land left after parks. Percentages normalize when you generate.</p>
      <div className="advanced-fields">
        {ZONE_TYPES.map((zone) => (
          <label key={zone}>
            {zone === "park" ? "Parks (%)" : `${zone} weight`}
            <input
              type="number"
              min={0}
              max={zone === "park" ? 25 : 100}
              step="any"
              required
              value={parameters.zoneMix[zone]}
              onChange={(event) =>
                onChange({
                  ...parameters,
                  zoneMix: { ...parameters.zoneMix, [zone]: event.target.valueAsNumber },
                })
              }
            />
          </label>
        ))}
        <label>
          Density
          <select
            value={parameters.density}
            onChange={(event) =>
              onChange({
                ...parameters,
                density: event.target.value as GenerationParameters["density"],
              })
            }
          >
            {DENSITY_LEVELS.map((density) => (
              <option key={density} value={density}>
                {density}
              </option>
            ))}
          </select>
        </label>
        <label>
          Districts
          <input
            type="number"
            min={2}
            max={8}
            step={1}
            required
            value={parameters.districtCount}
            onChange={(event) =>
              onChange({ ...parameters, districtCount: event.target.valueAsNumber })
            }
          />
        </label>
        {(
          [
            ["roadRegularity", "Road regularity (organic → grid)"],
            ["roundaboutFrequency", "Roundabouts"],
            ["decorationDensity", "Decoration"],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            {label}: {parameters[field]}
            <input
              type="range"
              min={0}
              max={100}
              value={parameters[field]}
              onChange={(event) => onChange({ ...parameters, [field]: event.target.valueAsNumber })}
            />
          </label>
        ))}
        <label>
          Theme
          <select
            value={parameters.colorTheme}
            onChange={(event) => onChange({ ...parameters, colorTheme: event.target.value })}
          >
            <option value="district">District colors</option>
            <option value="warm">Warm</option>
            <option value="cool">Cool</option>
          </select>
        </label>
      </div>
      <p>Density, decoration, and theme change how buildings and props are placed.</p>
    </details>
  );
}
