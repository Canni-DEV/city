import type { CityDocumentV1, DriveNetwork } from "@city/core";
import { Canvas, type RootState } from "@react-three/fiber";
import { useCallback } from "react";
import { CityScene } from "../city/CityCanvas";
import type { SimulationRuntime } from "../city/simulation-runtime";
import type { ResolvedQuality } from "../rendering/quality";
import {
  createCompatibleRenderer,
  detectRendererBackend,
  type RendererBackend,
  syncRendererLayout,
} from "../rendering/renderer";
import type { ExperienceHero } from "./experience-timeline";

const NO_OVERLAYS = {
  zones: false,
  lots: false,
  grid: false,
  traffic: false,
  pedestrians: false,
};

export function ExperienceCanvas({
  document,
  driveNetwork,
  runtime,
  quality,
  hero,
  progress,
  meetLabel,
  onBackend,
  onReady,
  onMeet,
}: {
  document: CityDocumentV1;
  driveNetwork: DriveNetwork | null;
  runtime: SimulationRuntime;
  quality: ResolvedQuality;
  hero: ExperienceHero;
  progress: number;
  meetLabel: string;
  onBackend: (backend: RendererBackend) => void;
  onReady: () => void;
  onMeet: () => void;
}) {
  const onCreated = useCallback(
    (state: RootState) => {
      syncRendererLayout(state.gl.domElement, state.setSize);
      onBackend(detectRendererBackend(state.gl));
    },
    [onBackend],
  );
  return (
    <Canvas
      aria-label={`Cinematic 3D view of ${document.name}`}
      camera={{ position: [0, document.map.size, document.map.size], fov: 34 }}
      dpr={[1, quality.pixelRatioCap]}
      gl={createCompatibleRenderer}
      onCreated={onCreated}
      shadows={quality.shadows}
      style={{ position: "absolute", inset: 0 }}
    >
      <CityScene
        document={document}
        overlays={NO_OVERLAYS}
        driveNetwork={driveNetwork}
        selectedDriveId={null}
        simulation={runtime}
        selectedNpcId={null}
        onSelectDrive={() => undefined}
        quality={quality}
        selectedEntityId={null}
        cameraMode="cityOrbit"
        controlledNpcId={null}
        onSelectNpc={() => undefined}
        onSelect={() => undefined}
        onStats={() => undefined}
        experience={{ progress, hero, onReady, onMeet, meetLabel }}
      />
    </Canvas>
  );
}
