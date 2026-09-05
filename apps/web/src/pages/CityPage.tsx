import {
  CITY_PRESETS,
  GenerationWorkerEventSchema,
  type MapSize,
  PRESET_PARAMETERS,
} from "@city/core";
import { Button, Panel } from "@city/ui";
import { CircleStop, Dices, RotateCcw, Route } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { RoadCityCanvas } from "../city/RoadCityCanvas";
import { useCityStore } from "../state/city-store";

const SIZE_OPTIONS: readonly MapSize[] = [64, 96, 128];

export function CityPage() {
  const [name, setName] = useState("New City");
  const [seed, setSeed] = useState("green-crossroads");
  const [size, setSize] = useState<MapSize>(64);
  const [preset, setPreset] = useState<(typeof CITY_PRESETS)[number]>("balanced");
  const workerRef = useRef<Worker | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const store = useCityStore();

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
    const requestId = crypto.randomUUID();
    activeRequestRef.current = requestId;
    startedAtRef.current = performance.now();
    store.startGeneration();
    workerRef.current?.postMessage({
      type: "generate",
      requestId,
      name: name.trim(),
      seed: seed.trim(),
      parameters: { ...PRESET_PARAMETERS[preset], size },
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
          <p className="eyebrow">M1 road laboratory</p>
          <h1>Generate a road city</h1>
          <p>Seeded districts, organic connections, modular curves and validated city gates.</p>
        </div>
        <form onSubmit={generate}>
          <label>
            City name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
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
                onClick={() => setSeed(`city-${crypto.randomUUID().slice(0, 8)}`)}
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
                onChange={(event) => setSize(Number(event.target.value) as MapSize)}
              >
                {SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} × {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Road preset
              <select
                value={preset}
                onChange={(event) => setPreset(event.target.value as typeof preset)}
              >
                {CITY_PRESETS.map((option) => (
                  <option key={option} value={option}>
                    {option.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {store.status === "generating" ? (
            <Button type="button" onClick={cancel}>
              <CircleStop size={18} /> Cancel
            </Button>
          ) : (
            <Button variant="primary" type="submit">
              <Route size={18} /> {store.document ? "Generate another" : "Generate city"}
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
        {store.document && (
          <Panel className="city-diagnostics">
            <div>
              <span>Backend</span>
              <strong>{store.backend}</strong>
            </div>
            <div>
              <span>Road cells</span>
              <strong>{store.document.roadGraph.cells.length}</strong>
            </div>
            <div>
              <span>Connections</span>
              <strong>{store.document.roadGraph.edges.length}</strong>
            </div>
            <div>
              <span>Gates</span>
              <strong>
                {store.document.roadGraph.nodes.filter((node) => node.kind === "gate").length}
              </strong>
            </div>
            <div>
              <span>Attempt</span>
              <strong>{store.document.generator.attempt + 1}/3</strong>
            </div>
            <div>
              <span>Generated</span>
              <strong>{store.durationMs?.toFixed(0)} ms</strong>
            </div>
          </Panel>
        )}
      </aside>
      <section className="city-viewport" aria-label="Generated city viewport">
        <RoadCityCanvas document={store.document} onBackend={store.setBackend} />
        {!store.document && (
          <div className="viewport-empty">
            <RotateCcw size={42} aria-hidden="true" />
            <h2>A deterministic city is one click away.</h2>
            <p>The same seed and parameters always resolve to the same road structure.</p>
          </div>
        )}
      </section>
    </div>
  );
}
