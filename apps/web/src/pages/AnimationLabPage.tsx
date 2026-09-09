import { assetById, runtimeAssetUrl } from "@city/assets";
import type { Beat, CreateAnimatedCharacterOptions } from "@city/procedural-animation";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, type RootState, useFrame, useLoader } from "@react-three/fiber";
import { Activity, Download, RotateCcw } from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three/webgpu";
import { useAnimatedCharacter } from "../city/use-animated-character";
import { createCompatibleRenderer, syncRendererLayout } from "../rendering/renderer";

interface LabProfile {
  style: number;
  stepLength: number;
  cadence: number;
  footLift: number;
}

const DEFAULT_PROFILE: LabProfile = {
  style: 0.65,
  stepLength: 0.72,
  cadence: 3.2,
  footLift: 0.1,
};

const labEntry = (() => {
  const entry = assetById.get("protagonists:character-medium");
  if (!entry) throw new Error("Missing protagonists:character-medium catalog entry");
  return entry;
})();
const labActorIds = Array.from({ length: 50 }, (_, index) => `lab-npc-${index}`);
const labSkins = labEntry.texturePaths.map((path) => ({
  path,
  label:
    path
      .split("/")
      .at(-1)
      ?.replace(/\.png$/i, "") ?? path,
}));

function LabCharacter({
  index,
  speed,
  paused,
  stepSequence,
  beat,
  profile,
  debug,
  skinPath,
  resetSequence,
  onSample,
}: {
  index: number;
  speed: number;
  paused: boolean;
  stepSequence: number;
  beat: { sequence: number; value: Beat } | null;
  profile: LabProfile;
  debug: boolean;
  skinPath: string;
  resetSequence: number;
  onSample?: (milliseconds: number) => void;
}) {
  const { scene, animations } = useGLTF(
    runtimeAssetUrl(labEntry.runtimePath, import.meta.env.BASE_URL),
  );
  const texture = useLoader(
    THREE.TextureLoader,
    runtimeAssetUrl(skinPath, import.meta.env.BASE_URL),
  );
  const time = useRef(0);
  const lastStep = useRef(stepSequence);
  const lastBeat = useRef(0);
  const { actor, actorRef } = useAnimatedCharacter(
    () => ({
      gltf: { scene, animations } as CreateAnimatedCharacterOptions["gltf"],
      texture,
      height: 1.8,
      seed: index + 1,
      animation: {
        style: profile.style,
        stepLength: profile.stepLength,
        cadence: profile.cadence,
        footLift: profile.footLift,
        walkSpeed: 1.5,
        runSpeed: 4.5,
      },
    }),
    [animations, index, resetSequence, scene, texture],
    () => {
      time.current = 0;
      lastBeat.current = 0;
      return () => {};
    },
  );
  useLayoutEffect(() => {
    actorRef.current?.setParameters({
      style: profile.style,
      stepLength: profile.stepLength,
      cadence: profile.cadence,
      footLift: profile.footLift,
    });
  }, [actorRef, profile]);

  const helper = useMemo(() => (actor ? new THREE.SkeletonHelper(actor.object) : null), [actor]);
  useEffect(
    () => () => {
      helper?.dispose();
    },
    [helper],
  );
  useEffect(() => {
    const current = actorRef.current;
    if (!current || !beat || index !== 0 || beat.sequence === lastBeat.current) return;
    current.playBeat(beat.value);
    lastBeat.current = beat.sequence;
  }, [actorRef, beat, index]);

  useFrame((_, delta) => {
    const current = actorRef.current;
    if (!current) return;
    const stepping = lastStep.current !== stepSequence;
    lastStep.current = stepSequence;
    if (paused && !stepping) return;
    const started = performance.now();
    const dt = stepping ? 1 / 60 : Math.min(delta, 1 / 30);
    time.current += dt;
    const row = Math.floor(index / 10),
      column = index % 10,
      baseX = (column - 4.5) * 2.1,
      baseZ = row * 2.2,
      moving = index === 0 ? speed : 0.45,
      phase = time.current * (0.35 + index * 0.003),
      x = index === 0 ? 0 : baseX + Math.sin(phase) * 0.35,
      z = index === 0 ? time.current * moving : baseZ + Math.cos(phase) * 0.35;
    current.fixedUpdate(
      dt,
      {
        position: { x, y: 0, z },
        facingYaw: index === 0 ? 0 : Math.atan2(Math.cos(phase), -Math.sin(phase)),
        velocity:
          index === 0
            ? { x: 0, y: 0, z: moving }
            : { x: Math.cos(phase) * 0.12, y: 0, z: -Math.sin(phase) * 0.12 },
        grounded: true,
      },
      index === 0 ? { attention: { target: { x: 2, y: 1.5, z: z + 2 } } } : {},
    );
    current.updateVisual(1);
    onSample?.(performance.now() - started);
  });

  if (!actor) return null;
  if (helper) helper.visible = debug;
  return (
    <>
      <primitive object={actor.object} />
      {helper ? <primitive object={helper} /> : null}
    </>
  );
}

export function AnimationLabPage() {
  const [speed, setSpeed] = useState(1.5);
  const [paused, setPaused] = useState(false);
  const [stepSequence, setStepSequence] = useState(0);
  const [resetSequence, setResetSequence] = useState(0);
  const [beat, setBeat] = useState<{ sequence: number; value: Beat } | null>(null);
  const [debug, setDebug] = useState(false);
  const [crowd, setCrowd] = useState(false);
  const [skinIndex, setSkinIndex] = useState(0);
  const [profile, setProfile] = useState<LabProfile>(DEFAULT_PROFILE);
  const samples = useRef<number[]>([]);
  const [p95, setP95] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const sorted = [...samples.current].sort((a, b) => a - b);
      setP95(sorted[Math.floor(Math.max(0, sorted.length - 1) * 0.95)] ?? 0);
    }, 500);
    return () => window.clearInterval(timer);
  }, []);
  const play = (value: Beat) =>
    setBeat((current) => ({ sequence: (current?.sequence ?? 0) + 1, value }));
  const exportBenchmark = () => {
    const data = {
      date: new Date().toISOString(),
      npc: crowd ? 50 : 1,
      samples: samples.current.length,
      animationP95: p95,
      targetP95: 4,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "npc-benchmark.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const onCreated = useCallback((state: RootState) => {
    syncRendererLayout(state.gl.domElement, state.setSize);
  }, []);

  return (
    <div className="animation-lab">
      <aside className="animation-lab-panel">
        <p className="eyebrow">Development</p>
        <h1>Animation lab</h1>
        <label>
          Skin
          <select value={skinIndex} onChange={(event) => setSkinIndex(Number(event.target.value))}>
            {labSkins.map((skin, index) => (
              <option key={skin.path} value={index}>
                {skin.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Speed: {speed.toFixed(2)} m/s
          <input
            type="range"
            min={0}
            max={4.5}
            step={0.05}
            value={speed}
            onChange={(event) => setSpeed(event.target.valueAsNumber)}
          />
        </label>
        {(
          [
            ["style", 0, 1.5, 0.05],
            ["stepLength", 0.25, 1.45, 0.01],
            ["cadence", 0.75, 5, 0.05],
            ["footLift", 0, 0.3, 0.005],
          ] as const
        ).map(([key, min, max, step]) => (
          <label key={key}>
            {key}: {profile[key].toFixed(2)}
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={profile[key]}
              onChange={(event) => setProfile({ ...profile, [key]: event.target.valueAsNumber })}
            />
          </label>
        ))}
        <div className="npc-control-actions">
          <button type="button" className="city-button" onClick={() => play({ type: "wave" })}>
            Wave
          </button>
          <button type="button" className="city-button" onClick={() => play({ type: "nod" })}>
            Nod
          </button>
          <button
            type="button"
            className="city-button"
            onClick={() => play({ type: "point", target: { x: 2, y: 1.2, z: 3 } })}
          >
            Point
          </button>
          <button type="button" className="city-button" onClick={() => play({ type: "punch" })}>
            Punch
          </button>
          <button type="button" className="city-button" onClick={() => play({ type: "kick" })}>
            Kick
          </button>
        </div>
        <div className="npc-control-actions">
          <button
            type="button"
            className="city-button"
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="city-button"
            disabled={!paused}
            onClick={() => setStepSequence((value) => value + 1)}
          >
            Step
          </button>
          <button
            type="button"
            className="city-button"
            onClick={() => {
              setProfile({ ...DEFAULT_PROFILE });
              setSpeed(1.5);
              setPaused(false);
              setResetSequence((value) => value + 1);
              samples.current = [];
              setP95(0);
            }}
          >
            <RotateCcw size={16} /> Reset
          </button>
        </div>
        <label>
          <input
            type="checkbox"
            checked={debug}
            onChange={(event) => setDebug(event.target.checked)}
          />{" "}
          Skeleton and IK
        </label>
        <label>
          <input
            type="checkbox"
            checked={crowd}
            onChange={(event) => {
              samples.current = [];
              setCrowd(event.target.checked);
            }}
          />{" "}
          Load: 50 NPC
        </label>
        <p>
          <Activity size={16} /> Animation p95 {p95.toFixed(2)} ms / 4 ms
        </p>
        <button type="button" className="city-button" onClick={exportBenchmark}>
          <Download size={16} /> Export benchmark
        </button>
      </aside>
      <section className="animation-lab-stage" aria-label="Procedural animation preview">
        <Canvas
          camera={{ position: [2.3, 1.3, 3], fov: 50, near: 0.05, far: 80 }}
          shadows
          style={{ position: "absolute", inset: 0 }}
          gl={createCompatibleRenderer}
          onCreated={onCreated}
        >
          <color attach="background" args={["#1a1d23"]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[8, 14, 6]} intensity={1.35} castShadow />
          <OrbitControls makeDefault target={[0, 0.9, 0]} enableDamping />
          <gridHelper args={[40, 40, "#5a6270", "#2e333c"]} />
          <Suspense fallback={null}>
            {labActorIds.slice(0, crowd ? 50 : 1).map((actorId, index) => (
              <LabCharacter
                key={actorId}
                index={index}
                speed={speed}
                paused={paused}
                stepSequence={stepSequence}
                beat={beat}
                profile={profile}
                debug={debug}
                resetSequence={resetSequence}
                skinPath={
                  index === 0
                    ? (labSkins[skinIndex]?.path ?? labEntry.texturePaths[0] ?? "")
                    : (labEntry.texturePaths[index % labEntry.texturePaths.length] ?? "")
                }
                onSample={
                  index === 0
                    ? (value) => {
                        samples.current.push(value);
                        if (samples.current.length > 3600) samples.current.shift();
                      }
                    : undefined
                }
              />
            ))}
          </Suspense>
        </Canvas>
      </section>
    </div>
  );
}
