import {
  type AssetCatalogEntry,
  agentUniformScale,
  assetById,
  runtimeAssetUrl,
} from "@city/assets";
import {
  type AgentRuntimeState,
  agentWorldPosition,
  type CityDocumentV1,
  clipForAgent,
  createRoadWalkPolicy,
  spawnAgents,
  tickAgents,
} from "@city/core";
import { useGLTF } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import * as THREE from "three/webgpu";

/** Kenney Run is a sprint; half speed matches DEFAULT_AGENT_SPEED (SIM-005). */
const RUN_CYCLE_TIME_SCALE = 0.5;
const MAX_FRAME_DELTA = 0.05;

function skinUrl(entry: AssetCatalogEntry, skin: string, baseUrl: string): string {
  const path =
    entry.texturePaths.find((texture) => texture.endsWith(`/${skin}.png`)) ?? entry.texturePaths[0];
  return runtimeAssetUrl(path ?? "", baseUrl);
}

function bindAgentClips(
  mixer: THREE.AnimationMixer,
  animations: THREE.AnimationClip[],
): { idle: THREE.AnimationAction | null; run: THREE.AnimationAction | null } {
  const idleSource = animations.find((clip) => clip.name === "idle");
  const runSource = animations.find((clip) => clip.name === "run");
  const idle = idleSource ? mixer.clipAction(idleSource.clone()) : null;
  const run = runSource ? mixer.clipAction(runSource.clone()) : null;
  idle?.setLoop(THREE.LoopRepeat, Infinity);
  run?.setLoop(THREE.LoopRepeat, Infinity);
  run?.setEffectiveTimeScale(RUN_CYCLE_TIME_SCALE);
  return { idle, run };
}

function playAgentClip(
  actions: { idle: THREE.AnimationAction | null; run: THREE.AnimationAction | null },
  clip: "idle" | "run",
): void {
  const active = clip === "run" ? actions.run : actions.idle;
  const other = clip === "run" ? actions.idle : actions.run;
  if (active) {
    active.enabled = true;
    active.setEffectiveWeight(1);
    if (!active.isRunning()) active.reset().play();
  }
  if (other) {
    other.enabled = true;
    other.setEffectiveWeight(0);
    if (!other.isRunning()) other.play();
  }
}

function AgentAvatar({
  index,
  agentsRef,
  entry,
  half,
}: {
  index: number;
  agentsRef: { current: AgentRuntimeState[] };
  entry: AssetCatalogEntry;
  half: number;
}) {
  const group = useRef<THREE.Group>(null);
  const clip = useRef<"idle" | "run">("idle");
  const { scene, animations } = useGLTF(
    runtimeAssetUrl(entry.runtimePath, import.meta.env.BASE_URL),
  );
  const skin = agentsRef.current[index]?.skin ?? "skaterMaleA";
  const texture = useLoader(THREE.TextureLoader, skinUrl(entry, skin, import.meta.env.BASE_URL));
  const root = useMemo(() => clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
  const actions = useMemo(() => bindAgentClips(mixer, animations), [animations, mixer]);
  const scale = agentUniformScale(entry);

  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.needsUpdate = true;
    root.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = materials.map(() => {
        const nodeMaterial = new THREE.MeshStandardNodeMaterial();
        nodeMaterial.color.set("#ffffff");
        nodeMaterial.metalness = 0;
        nodeMaterial.roughness = 0.7;
        nodeMaterial.map = texture;
        nodeMaterial.side = THREE.FrontSide;
        return nodeMaterial;
      });
      mesh.material = next.length === 1 ? (next[0] ?? mesh.material) : next;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [root, texture]);

  useLayoutEffect(() => {
    playAgentClip(actions, "idle");
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(mixer.getRoot());
    };
  }, [actions, mixer]);

  useFrame((_, delta) => {
    const agent = agentsRef.current[index];
    const target = group.current;
    if (!agent || !target) {
      if (target) target.visible = false;
      return;
    }
    target.visible = true;
    const [x, , z] = agentWorldPosition(agent);
    target.position.set(x - half, 0, z - half);
    target.rotation.y = agent.heading;
    const nextClip = clipForAgent(agent);
    if (nextClip !== clip.current) {
      clip.current = nextClip;
      playAgentClip(actions, nextClip);
    }
    mixer.update(Math.min(delta, MAX_FRAME_DELTA));
  });

  return (
    <group ref={group} scale={scale}>
      <primitive object={root} position={[0, entry.verticalOffset, 0]} />
    </group>
  );
}

export function AgentLayer({ document, count }: { document: CityDocumentV1; count: number }) {
  const body = assetById.get("protagonists:character-medium");
  const spawned = useMemo(
    () =>
      spawnAgents({
        seed: document.generator.seed,
        tiles: document.roadGraph.cells,
        count,
      }),
    [count, document.generator.seed, document.roadGraph.cells],
  );
  const agentsRef = useRef(spawned);
  const policy = useMemo(
    () => createRoadWalkPolicy(document.roadGraph.cells),
    [document.roadGraph.cells],
  );

  useLayoutEffect(() => {
    agentsRef.current = spawned;
  }, [spawned]);

  useFrame((_, delta) => {
    agentsRef.current = tickAgents(agentsRef.current, {
      policy,
      dt: Math.min(delta, MAX_FRAME_DELTA),
      seed: document.generator.seed,
    });
  });

  if (!body) return null;
  return (
    <>
      {spawned.map((agent) => (
        <AgentAvatar
          key={`${document.id}:${agent.id}`}
          index={agent.index}
          agentsRef={agentsRef}
          entry={body}
          half={document.map.size / 2}
        />
      ))}
    </>
  );
}
