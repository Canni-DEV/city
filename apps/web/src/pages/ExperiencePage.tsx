import { assetCatalog } from "@city/assets";
import {
  buildDriveNetwork,
  type CityDocumentV1,
  type GenerationProgress,
  greetNpc,
  PRESET_PARAMETERS,
  stopNpc,
  takeNpcControl,
} from "@city/core";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import type { CityEntryState } from "../city/city-entry";
import { createSimulationRuntime, resizeSimulation } from "../city/simulation-runtime";
import { CityWordmark } from "../experience/CityWordmark";
import { ExperienceCanvas } from "../experience/ExperienceCanvas";
import {
  actOpacity,
  experienceReveal,
  gatedExperienceProgress,
  scrollProgress,
  selectExperienceHero,
} from "../experience/experience-timeline";
import { useGenerationWorker } from "../generation/use-generation-worker";
import { resolveQuality } from "../rendering/quality";
import type { RendererBackend } from "../rendering/renderer";
import { useCityStore } from "../state/city-store";

type ExperienceStatus = "idle" | "generating" | "ready" | "error";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function ExperiencePage() {
  const navigate = useNavigate();
  const desktop = useMediaQuery("(min-width: 1280px) and (min-height: 720px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [status, setStatus] = useState<ExperienceStatus>("idle");
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState<CityDocumentV1 | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [backend, setBackend] = useState<RendererBackend | "initializing">("initializing");
  const [sceneReady, setSceneReady] = useState(false);
  const [rawProgress, setRawProgress] = useState(0);
  const [visualProgress, setVisualProgress] = useState(0);
  const scrollTarget = useRef(0);
  scrollTarget.current = gatedExperienceProgress(rawProgress, sceneReady);
  const [dotRadius, setDotRadius] = useState(10);
  const [leaving, setLeaving] = useState(false);
  const startedAt = useRef(0);
  const greeted = useRef(false);
  const leaveTimer = useRef<number | null>(null);

  const {
    generate,
    cancel,
    ready: generationReady,
  } = useGenerationWorker({
    enabled: desktop,
    onEvent: (event) => {
      if (event.type === "progress") {
        setProgress({ stage: event.stage, percent: event.percent, message: event.message });
      } else if (event.type === "complete") {
        setCity(event.city);
        setDurationMs(performance.now() - startedAt.current);
        setStatus("ready");
      } else if (event.type === "error") {
        setError(event.message);
        setStatus("error");
      } else if (event.type === "cancelled") {
        setStatus("idle");
      }
    },
    onWorkerError: (message) => {
      setError(message);
      setStatus("error");
    },
  });

  const startGeneration = useCallback(() => {
    setCity(null);
    setSceneReady(false);
    setError(null);
    setProgress({ stage: "mask", percent: 0, message: "Preparing generation" });
    setStatus("generating");
    greeted.current = false;
    startedAt.current = performance.now();
    const request = generate({
      name: "Green Crossroads",
      seed: "green-crossroads",
      parameters: PRESET_PARAMETERS.balanced,
    });
    if (!request) {
      setError("The city generator is not ready. Try again.");
      setStatus("error");
    }
  }, [generate]);

  useEffect(() => {
    if (desktop && generationReady && status === "idle") startGeneration();
  }, [desktop, generationReady, startGeneration, status]);

  useEffect(() => {
    if (desktop) return;
    cancel();
    setCity(null);
    setSceneReady(false);
    setStatus("idle");
  }, [cancel, desktop]);

  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!desktop || reducedMotion) return;
    const update = () =>
      setRawProgress(
        scrollProgress(window.scrollY, document.documentElement.scrollHeight, window.innerHeight),
      );
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [desktop, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      setVisualProgress(1);
      return;
    }
    let frame = 0;
    let previous = performance.now();
    const animate = (now: number) => {
      const target = scrollTarget.current;
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      setVisualProgress((current) => {
        const distance = target - current;
        if (Math.abs(distance) < 0.0005) return target;
        return current + Math.sign(distance) * Math.min(Math.abs(distance), dt * 0.85);
      });
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion]);

  const quality = useMemo(() => {
    const resolved = resolveQuality(
      "auto",
      backend,
      city?.map.size ?? 96,
      typeof navigator === "undefined"
        ? undefined
        : (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    );
    return { ...resolved, agentCount: 12, vehicleCount: 12 };
  }, [backend, city?.map.size]);

  const prepared = useMemo(() => {
    if (!city) return null;
    const drive = city.roadGraph.topology ? buildDriveNetwork(city, assetCatalog.entries) : null;
    const runtime = createSimulationRuntime(city, drive);
    resizeSimulation(runtime, 12, 12);
    const hero = selectExperienceHero(city, runtime.world.poses);
    if (hero) {
      takeNpcControl(runtime.world, hero.id);
      stopNpc(runtime.world, hero.id);
    }
    return { drive, runtime, hero };
  }, [city]);

  useEffect(() => {
    if (!sceneReady || visualProgress < 0.9 || greeted.current || !prepared?.hero) return;
    greeted.current = true;
    greetNpc(prepared.runtime.world, prepared.hero.id);
  }, [prepared, sceneReady, visualProgress]);

  const completeHandoff = useCallback(() => {
    if (!city || !prepared?.hero) return;
    const store = useCityStore.getState();
    store.adoptDocument(city, durationMs);
    if (backend !== "initializing") store.setBackend(backend);
    navigate(`/city/${city.id}`, {
      state: {
        source: "experience",
        controlledNpcId: prepared.hero.id,
      } satisfies CityEntryState,
    });
  }, [backend, city, durationMs, navigate, prepared]);

  const meetHero = useCallback(() => {
    if (!city || !prepared?.hero || leaving) return;
    if (reducedMotion) {
      completeHandoff();
      return;
    }
    setLeaving(true);
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<void> };
    };
    if (transitionDocument.startViewTransition) {
      transitionDocument.startViewTransition(() => flushSync(completeHandoff));
      return;
    }
    leaveTimer.current = window.setTimeout(completeHandoff, 320);
  }, [city, completeHandoff, leaving, prepared?.hero, reducedMotion]);

  if (!desktop) {
    return (
      <div className="experience-unsupported">
        <p className="eyebrow">City</p>
        <h1 className="experience-unsupported-title">This experience is designed for desktop.</h1>
        <p className="experience-unsupported-copy">Open it in a window at least 1280 × 720.</p>
        <Link className="experience-unsupported-link" to="/">
          Back to library
        </Link>
      </div>
    );
  }

  const viewportRadius =
    typeof window === "undefined" ? 1600 : Math.hypot(window.innerWidth, window.innerHeight) * 0.82;
  const reveal = experienceReveal(visualProgress, dotRadius, viewportRadius);
  const pageStyle = {
    "--experience-mask-radius": `${reveal.maskRadius}px`,
  } as CSSProperties;

  return (
    <div
      className={`experience-page${reducedMotion ? " experience-page--reduced" : ""}${leaving ? " experience-page--leaving" : ""}`}
      style={pageStyle}
    >
      <Link className="experience-back" to="/">
        Back to library
      </Link>
      <div className="experience-stage">
        {city && prepared?.hero ? (
          <div className="experience-canvas-mask">
            <ExperienceCanvas
              document={city}
              driveNetwork={prepared.drive}
              runtime={prepared.runtime}
              quality={quality}
              hero={prepared.hero}
              progress={visualProgress}
              meetLabel={reducedMotion ? "Explore the city" : "Meet me"}
              onBackend={setBackend}
              onReady={() => setSceneReady(true)}
              onMeet={meetHero}
            />
          </div>
        ) : null}

        {reducedMotion ? (
          <section className="experience-reduced-copy">
            <p className="eyebrow">A procedural city sandbox</p>
            <h1 className="experience-reduced-title">City</h1>
            <p className="experience-reduced-body">
              Generate connected streets, distinct districts, and detailed blocks from a single
              seed.
            </p>
          </section>
        ) : (
          <>
            <h1 className="visually-hidden">City</h1>
            <CityWordmark
              scale={reveal.scale}
              opacity={reveal.opacity}
              onDotRadius={setDotRadius}
            />
            <section
              className="experience-copy experience-copy--opening"
              style={{ opacity: actOpacity(visualProgress, -0.1, 0, 0.31) }}
            >
              <p className="eyebrow">A procedural city sandbox</p>
              <p className="experience-copy-body">
                Generate connected streets, distinct districts, and detailed blocks from a single
                seed.
              </p>
            </section>
            <section
              className="experience-copy experience-copy--rules"
              style={{ opacity: actOpacity(visualProgress, 0.28, 0.39, 0.63) }}
            >
              <p className="eyebrow">Built from rules</p>
              <p className="experience-copy-body">
                Roads connect first. Blocks, lots, zones, buildings, parks, and street details
                follow deterministically.
              </p>
            </section>
            <section
              className="experience-copy experience-copy--alive"
              style={{ opacity: actOpacity(visualProgress, 0.58, 0.69, 0.9) }}
            >
              <p className="eyebrow">Alive, never persisted</p>
              <p className="experience-copy-body">
                Pedestrians and vehicles are reconstructed at runtime from the city document,
                keeping the source clean and reproducible.
              </p>
            </section>
          </>
        )}

        {(status === "generating" || (status === "ready" && !sceneReady)) && (
          <p className="experience-loading" role="status" aria-live="polite">
            {status === "ready"
              ? "Preparing city view"
              : `${progress?.message ?? "Preparing generation"} · ${Math.round(progress?.percent ?? 0)}%`}
          </p>
        )}
        {status === "error" ? (
          <section className="experience-error" role="alert">
            <h2>City generation stopped.</h2>
            <p className="experience-error-message">{error}</p>
            <div>
              <button type="button" onClick={startGeneration}>
                Retry
              </button>
              <Link className="experience-error-link" to="/">
                Back to library
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
