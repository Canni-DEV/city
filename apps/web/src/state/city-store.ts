import type { CityDocumentV1, GenerationProgress } from "@city/core";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { QualityProfile } from "../rendering/quality";
import type { RendererBackend } from "../rendering/renderer";

type GenerationStatus = "idle" | "generating" | "ready" | "error";

interface CityState {
  document: CityDocumentV1 | null;
  progress: GenerationProgress | null;
  status: GenerationStatus;
  error: string | null;
  backend: RendererBackend | "initializing";
  durationMs: number | null;
  quality: QualityProfile;
  selectedEntityId: string | null;
  startGeneration: () => void;
  reportProgress: (progress: GenerationProgress) => void;
  completeGeneration: (document: CityDocumentV1, durationMs: number) => void;
  failGeneration: (message: string) => void;
  cancelGeneration: () => void;
  setBackend: (backend: RendererBackend) => void;
  setQuality: (quality: QualityProfile) => void;
  selectEntity: (entityId: string | null) => void;
}

export const useCityStore = create<CityState>()(
  immer((set) => ({
    document: null,
    progress: null,
    status: "idle",
    error: null,
    backend: "initializing",
    durationMs: null,
    quality: "auto",
    selectedEntityId: null,
    startGeneration: () =>
      set((state) => {
        state.status = "generating";
        state.error = null;
        state.progress = { stage: "mask", percent: 0, message: "Preparing generation" };
      }),
    reportProgress: (progress) =>
      set((state) => {
        state.progress = progress;
      }),
    completeGeneration: (document, durationMs) =>
      set((state) => {
        state.document = document;
        state.durationMs = durationMs;
        state.selectedEntityId = null;
        state.status = "ready";
        state.progress = {
          stage: "validation",
          percent: 100,
          message: "City buildings and decoration ready",
        };
      }),
    failGeneration: (message) =>
      set((state) => {
        state.status = "error";
        state.error = message;
      }),
    cancelGeneration: () =>
      set((state) => {
        state.status = state.document ? "ready" : "idle";
        state.progress = null;
      }),
    setBackend: (backend) =>
      set((state) => {
        state.backend = backend;
      }),
    setQuality: (quality) =>
      set((state) => {
        state.quality = quality;
      }),
    selectEntity: (entityId) =>
      set((state) => {
        state.selectedEntityId = entityId;
      }),
  })),
);
