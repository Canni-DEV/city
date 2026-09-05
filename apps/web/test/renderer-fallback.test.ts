import { createEmptyCityDocument, PRESET_PARAMETERS } from "@city/core";
import { describe, expect, it, vi } from "vitest";
import {
  detectRendererBackend,
  initializeWithFallback,
  readCanvasLayoutSize,
} from "../src/rendering/renderer";
import { useCityStore } from "../src/state/city-store";

function sampleDocument() {
  return createEmptyCityDocument({
    id: "city-fallback",
    name: "Fallback City",
    seed: "fallback",
    parameters: PRESET_PARAMETERS.balanced,
    timestamp: "2026-09-05T00:00:00.000Z",
  });
}

describe("TST-007 renderer fallback", () => {
  it("recreates WebGL 2 once when WebGPU initialization fails and keeps the open document", async () => {
    const document = sampleDocument();
    useCityStore.setState({
      document,
      status: "ready",
      backend: "initializing",
      quality: "auto",
      selectedEntityId: null,
    });
    const disposed: string[] = [];
    const created: boolean[] = [];
    const result = await initializeWithFallback({
      forceWebGL: false,
      create(forceWebGL) {
        created.push(forceWebGL);
        const label = forceWebGL ? "webgl2" : "webgpu";
        return {
          label,
          dispose: () => {
            disposed.push(label);
          },
        };
      },
      async initialize(renderer) {
        if (renderer.label === "webgpu") throw new Error("WebGPU unavailable");
      },
    });
    expect(created).toEqual([false, true]);
    expect(disposed).toEqual(["webgpu"]);
    expect(result.backend).toBe("webgl2");
    expect(useCityStore.getState().document).toBe(document);
  });

  it("uses forced WebGL 2 without attempting a second fallback", async () => {
    const create = vi.fn((forceWebGL: boolean) => ({
      forceWebGL,
      dispose: vi.fn(),
    }));
    const result = await initializeWithFallback({
      forceWebGL: true,
      create,
      async initialize() {},
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.backend).toBe("webgl2");
  });

  it("REN-002/REN-008 quality and backend changes leave the document identity intact", () => {
    const document = sampleDocument();
    useCityStore.getState().completeGeneration(document, 1280);
    useCityStore.getState().setBackend("webgl2");
    useCityStore.getState().setQuality("low");
    expect(useCityStore.getState().document).toBe(document);
  });

  it("REN-001 reads layout size from the container, not the canvas default", () => {
    const parent = {
      clientWidth: 10,
      clientHeight: 10,
      getBoundingClientRect: () => ({ width: 1280, height: 720, top: 70, left: 370 }),
    } as HTMLElement;
    const canvas = {
      clientWidth: 300,
      clientHeight: 150,
      parentElement: parent,
    } as HTMLCanvasElement;
    expect(readCanvasLayoutSize(canvas)).toEqual({
      width: 1280,
      height: 720,
      top: 70,
      left: 370,
    });
  });

  it("REN-001 reports WebGL 2 from the active Three.js backend", () => {
    expect(detectRendererBackend({ backend: { isWebGLBackend: true } })).toBe("webgl2");
    expect(detectRendererBackend({ backend: {} })).toBe("webgpu");
  });
});
