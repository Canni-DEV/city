import { assetCatalog } from "@city/assets";
import {
  buildDriveNetwork,
  CITY_PRESETS,
  type GenerationParameters,
  GenerationWorkerEventSchema,
  MAP_SIZES,
  type MapSize,
  normalizeGenerationParameters,
  PRESET_PARAMETERS,
  ZONE_TYPES,
  zoneAreaShares,
} from "@city/core";
import { Button, Panel } from "@city/ui";
import { CircleStop, Dices, RotateCcw, Route, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CityCanvas } from "../city/CityCanvas";
import { GenerationControls } from "../city/GenerationControls";
import { isEditableTarget } from "../city/keyboard";
import { PedestrianInspector } from "../city/PedestrianInspector";
import { createSimulationRuntime } from "../city/simulation-runtime";
import { suggestCityName } from "../city/suggest-city-name";
import { TrafficInspector } from "../city/TrafficInspector";
import { QUALITY_PROFILES, resolveQuality } from "../rendering/quality";
import { useCityStore } from "../state/city-store";

const RUNTIME_COUNT_MAX = 64;

export function CityPage() {
  const [name, setName] = useState("Green Crossroads");
  const [seed, setSeed] = useState("green-crossroads");
  const [nameTouched, setNameTouched] = useState(false);
  const [size, setSize] = useState<MapSize>(96);
  const [preset, setPreset] = useState<(typeof CITY_PRESETS)[number]>("balanced");
  const [parameters, setParameters] = useState<GenerationParameters>(PRESET_PARAMETERS.balanced);
  const [overlays, setOverlays] = useState({
    zones: false,
    lots: false,
    grid: false,
    traffic: false,
    pedestrians: false,
  });
  const [freeCamera, setFreeCamera] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [stats, setStats] = useState({ fps: 0, drawCalls: 0 });
  const workerRef = useRef<Worker | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const store = useCityStore();
  const generatedCity = store.document;
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const driveNetwork = useMemo(
    () =>
      generatedCity?.roadGraph.topology
        ? buildDriveNetwork(generatedCity, assetCatalog.entries)
        : null,
    [generatedCity],
  );
  useEffect(() => {
    if (generatedCity) setSelectedDriveId(null);
  }, [generatedCity]);
  const simulation = useMemo(
    () => (generatedCity ? createSimulationRuntime(generatedCity, driveNetwork) : null),
    [generatedCity, driveNetwork],
  );
  const qualityBase = useMemo(
    () =>
      resolveQuality(
        store.quality,
        store.backend,
        generatedCity?.map.size ?? size,
        typeof navigator === "undefined"
          ? undefined
          : (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      ),
    [generatedCity?.map.size, size, store.backend, store.quality],
  );
  const [agentCount, setAgentCount] = useState(qualityBase.agentCount);
  const [vehicleCount, setVehicleCount] = useState(qualityBase.vehicleCount);
  useEffect(() => {
    setAgentCount(qualityBase.agentCount);
    setVehicleCount(qualityBase.vehicleCount);
  }, [qualityBase.agentCount, qualityBase.vehicleCount]);
  const quality = useMemo(
    () => ({ ...qualityBase, agentCount, vehicleCount }),
    [agentCount, qualityBase, vehicleCount],
  );
  const selectedEntity = generatedCity?.entities[store.selectedEntityId ?? ""] ?? null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (event.key === "Escape") {
        setSelectedDriveId(null);
        setSelectedNpcId(null);
        if (freeCamera) {
          setFreeCamera(false);
          return;
        }
        useCityStore.getState().selectEntity(null);
        return;
      }
      if (event.key === "f" || event.key === "F") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (!useCityStore.getState().document) return;
        event.preventDefault();
        setFreeCamera((enabled) => !enabled);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [freeCamera]);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/generation.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onerror = (event) => {
      useCityStore
        .getState()
        .failGeneration(event.message || "The generation worker failed to start.");
      activeRequestRef.current = null;
    };
    worker.onmessageerror = () => {
      useCityStore
        .getState()
        .failGeneration("The generation worker returned an unreadable message.");
      activeRequestRef.current = null;
    };
    worker.onmessage = (message: MessageEvent<unknown>) => {
      const actions = useCityStore.getState();
      const parsed = GenerationWorkerEventSchema.safeParse(message.data);
      if (!parsed.success || parsed.data.requestId !== activeRequestRef.current) return;
      const event = parsed.data;
      if (event.type === "progress") {
        actions.reportProgress({
          stage: event.stage,
          percent: event.percent,
          message: event.message,
        });
      } else if (event.type === "complete") {
        actions.completeGeneration(event.city, performance.now() - startedAtRef.current);
        activeRequestRef.current = null;
      } else if (event.type === "cancelled") {
        actions.cancelGeneration();
        activeRequestRef.current = null;
      } else if (event.type === "error") {
        actions.failGeneration(event.message);
        activeRequestRef.current = null;
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  function generate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !seed.trim()) {
      setFormError("City name and seed must contain text, not just spaces.");
      return;
    }
    if (
      !Number.isFinite(parameters.districtCount) ||
      Object.values(parameters.zoneMix).some((value) => !Number.isFinite(value))
    ) {
      setFormError("Enter numbers for every advanced control. Parks stay between 0 and 25%.");
      return;
    }
    let normalized: GenerationParameters;
    try {
      normalized = normalizeGenerationParameters({ ...parameters, preset, size });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Check the advanced controls.");
      return;
    }
    setFormError(null);
    const requestId = crypto.randomUUID();
    activeRequestRef.current = requestId;
    startedAtRef.current = performance.now();
    store.startGeneration();
    workerRef.current?.postMessage({
      type: "generate",
      requestId,
      name: name.trim(),
      seed: seed.trim(),
      parameters: normalized,
    });
  }

  function cancel() {
    const requestId = activeRequestRef.current;
    if (requestId) workerRef.current?.postMessage({ type: "cancel", requestId });
  }

  return (
    <div className="city-workspace">
      <aside className="generator-panel">
        <div>
          <p className="eyebrow">Generate</p>
          <h1>Parameters</h1>
        </div>
        <form onSubmit={generate}>
          <label>
            City name
            <span className="input-with-action">
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setNameTouched(true);
                  setName(event.target.value);
                }}
              />
              <button
                type="button"
                aria-label="Suggest a city name"
                onClick={() => {
                  setNameTouched(true);
                  setName(suggestCityName());
                }}
              >
                <Sparkles size={18} />
              </button>
            </span>
          </label>
          <label>
            Seed
            <span className="input-with-action">
              <input
                required
                maxLength={64}
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
              />
              <button
                type="button"
                aria-label="Suggest a seed"
                onClick={() => {
                  const next = `city-${crypto.randomUUID().slice(0, 8)}`;
                  setSeed(next);
                  if (!nameTouched) setName(suggestCityName(next));
                }}
              >
                <Dices size={18} />
              </button>
            </span>
          </label>
          <div className="field-row">
            <label>
              Size
              <select
                value={size}
                onChange={(event) => {
                  const next = Number(event.target.value) as MapSize;
                  setSize(next);
                  setParameters((current) => ({ ...current, size: next }));
                }}
              >
                {MAP_SIZES.map((option) => (
                  <option key={option} value={option}>
                    {option} × {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Preset
              <select
                value={preset}
                onChange={(event) => {
                  const next = event.target.value as typeof preset;
                  setPreset(next);
                  setParameters({ ...PRESET_PARAMETERS[next], size });
                }}
              >
                {CITY_PRESETS.map((option) => (
                  <option key={option} value={option}>
                    {option.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <GenerationControls parameters={parameters} onChange={setParameters} />
          <label>
            Pedestrians: {agentCount}
            <input
              type="range"
              min={0}
              max={RUNTIME_COUNT_MAX}
              value={agentCount}
              onChange={(event) => setAgentCount(event.target.valueAsNumber)}
            />
          </label>
          <label>
            Vehicles: {vehicleCount}
            <input
              type="range"
              min={0}
              max={RUNTIME_COUNT_MAX}
              value={vehicleCount}
              onChange={(event) => setVehicleCount(event.target.valueAsNumber)}
            />
          </label>
          {formError && (
            <p className="error-message" role="alert">
              {formError}
            </p>
          )}
          {store.status === "generating" ? (
            <Button type="button" onClick={cancel}>
              <CircleStop size={18} /> Cancel
            </Button>
          ) : (
            <Button variant="primary" type="submit">
              <Route size={18} /> {generatedCity ? "Regenerate" : "Generate"}
            </Button>
          )}
        </form>
        {store.progress && (
          <div className="generation-progress" aria-live="polite">
            <div>
              <span>{store.progress.stage}</span>
              <strong>{Math.round(store.progress.percent)}%</strong>
            </div>
            <progress max={100} value={store.progress.percent} />
            <p>{store.progress.message}</p>
          </div>
        )}
        {store.error && (
          <p className="error-message" role="alert">
            {store.error}
          </p>
        )}
        {store.backend === "webgl2" && (
          <p className="compatibility-notice" role="status">
            WebGL 2 compatibility mode is active.
          </p>
        )}
        {generatedCity && (
          <fieldset className="overlay-controls">
            <legend>Map overlays</legend>
            {(
              [
                ["zones", "Zone colors"],
                ["lots", "Lot edges"],
                ["grid", "Cell grid"],
                ["traffic", "Traffic lanes"],
                ["pedestrians", "Pedestrian navigation"],
              ] as const
            ).map(([overlay, label]) => (
              <label key={overlay}>
                <input
                  type="checkbox"
                  checked={overlays[overlay]}
                  onChange={(event) =>
                    setOverlays({ ...overlays, [overlay]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <ul className="zone-legend" aria-label="Zone colors, patterns, and area shares">
              {ZONE_TYPES.map((zone) => (
                <li key={zone}>
                  <span className={`zone-swatch zone-${zone}`} aria-hidden="true" />
                  {zone}: {zoneAreaShares(generatedCity)[zone].toFixed(1)}%
                  <small>
                    target {generatedCity.generator.parameters.zoneMix[zone].toFixed(1)}%
                  </small>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        {overlays.pedestrians && simulation && (
          <PedestrianInspector
            runtime={simulation}
            selected={selectedNpcId}
            onSelect={setSelectedNpcId}
          />
        )}
        {overlays.traffic && driveNetwork && (
          <TrafficInspector
            network={driveNetwork}
            selected={selectedDriveId}
            onSelect={setSelectedDriveId}
          />
        )}
        {generatedCity && (
          <>
            <label>
              Graphics quality
              <select
                value={store.quality}
                onChange={(event) =>
                  store.setQuality(event.target.value as (typeof QUALITY_PROFILES)[number])
                }
              >
                {QUALITY_PROFILES.map((profile) => (
                  <option key={profile} value={profile}>
                    {profile === "auto" ? `Auto (${quality.resolved})` : profile}
                  </option>
                ))}
              </select>
            </label>
            <p className="selection-status" aria-live="polite">
              {selectedEntity
                ? `Selected ${selectedEntity.assetId.replace(":", " ")}`
                : "No selection."}
            </p>
            <button
              type="button"
              className="city-button"
              aria-pressed={freeCamera}
              aria-label={
                freeCamera
                  ? "Return to city camera. Shortcut F."
                  : "Enable free camera. Shortcut F."
              }
              onClick={() => setFreeCamera((enabled) => !enabled)}
            >
              {freeCamera ? "City camera (F)" : "Free camera (F)"}
            </button>
            {freeCamera ? (
              <p className="selection-status" role="status">
                Free camera: WASD moves, right-drag looks, wheel flies along view, Space/E up, C/Q
                down, Shift faster. F or Escape returns to the city view.
              </p>
            ) : null}
            <Panel className="city-diagnostics">
              <div>
                <span>Entities</span>
                <strong>{Object.keys(generatedCity.entities).length}</strong>
              </div>
              <div>
                <span>Draw calls</span>
                <strong>{stats.drawCalls || "—"}</strong>
              </div>
              <div>
                <span>Backend</span>
                <strong>{store.backend}</strong>
              </div>
              <div>
                <span>Quality</span>
                <strong>
                  {store.quality}
                  {store.quality === "auto" ? `/${quality.resolved}` : ""}
                </strong>
              </div>
              <div>
                <span>Frame rate</span>
                <strong>{stats.fps ? `${stats.fps.toFixed(0)} fps` : "—"}</strong>
              </div>
              <div>
                <span>Generated</span>
                <strong>{store.durationMs?.toFixed(0)} ms</strong>
              </div>
              <div>
                <span>Pedestrians</span>
                <strong>{quality.agentCount}</strong>
              </div>
              <div>
                <span>Vehicles</span>
                <strong>{quality.vehicleCount}</strong>
              </div>
              <div>
                <span>Lots</span>
                <strong>{generatedCity.lots.length}</strong>
              </div>
              <div>
                <span>Road cells</span>
                <strong>{generatedCity.roadGraph.cells.length}</strong>
              </div>
              <div>
                <span>Sidewalks</span>
                <strong>{generatedCity.sidewalks.length}</strong>
              </div>
            </Panel>
          </>
        )}
      </aside>
      <section className="city-viewport" aria-label="Generated city viewport">
        <CityCanvas
          simulation={simulation}
          selectedNpcId={selectedNpcId}
          driveNetwork={driveNetwork}
          selectedDriveId={selectedDriveId}
          onSelectDrive={setSelectedDriveId}
          document={generatedCity}
          onBackend={store.setBackend}
          overlays={overlays}
          quality={quality}
          selectedEntityId={store.selectedEntityId}
          freeCamera={freeCamera}
          onSelect={store.selectEntity}
          onStats={setStats}
        />
        {generatedCity && freeCamera ? (
          <p className="free-camera-hint" role="status">
            Free camera. WASD to move, right-drag to look. F or Escape for city view.
          </p>
        ) : null}
        {!generatedCity && (
          <div className="viewport-empty">
            <RotateCcw size={42} aria-hidden="true" />
            <h2>No city.</h2>
            <p>Set seed and generate.</p>
          </div>
        )}
      </section>
    </div>
  );
}
