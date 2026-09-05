import { extend } from "@react-three/fiber";
import type { WebGLRendererParameters } from "three";
import * as THREE from "three/webgpu";

extend(THREE as unknown as Parameters<typeof extend>[0]);

export type RendererBackend = "webgpu" | "webgl2";

const rendererByCanvas = new WeakMap<HTMLCanvasElement, Promise<THREE.WebGPURenderer>>();

export type CanvasLayoutSize = {
  width: number;
  height: number;
  top: number;
  left: number;
};

/** Layout of the R3F container, not the HTML canvas default 300×150. */
export function readCanvasLayoutSize(canvas: HTMLCanvasElement): CanvasLayoutSize {
  const parent = canvas.parentElement;
  if (parent) {
    const rect = parent.getBoundingClientRect();
    const width = rect.width || parent.clientWidth;
    const height = rect.height || parent.clientHeight;
    if (width >= 1 && height >= 1) {
      return { width, height, top: rect.top, left: rect.left };
    }
  }
  return {
    width: Math.max(1, canvas.clientWidth),
    height: Math.max(1, canvas.clientHeight),
    top: 0,
    left: 0,
  };
}

export function syncRendererLayout(
  canvas: HTMLCanvasElement,
  setSize: (width: number, height: number, top?: number, left?: number) => void,
): void {
  const { width, height, top, left } = readCanvasLayoutSize(canvas);
  setSize(width, height, top, left);
}

export function detectRendererBackend(renderer: object): RendererBackend {
  const backend =
    "backend" in renderer
      ? (renderer as { backend?: { isWebGLBackend?: boolean } }).backend
      : undefined;
  return backend?.isWebGLBackend === true ? "webgl2" : "webgpu";
}

export async function initializeWithFallback<T extends { dispose: () => void }>(options: {
  forceWebGL: boolean;
  create: (forceWebGL: boolean) => T;
  initialize: (renderer: T) => Promise<void>;
}): Promise<{ renderer: T; backend: RendererBackend }> {
  if (options.forceWebGL) {
    const renderer = options.create(true);
    await options.initialize(renderer);
    return { renderer, backend: "webgl2" };
  }
  const renderer = options.create(false);
  try {
    await options.initialize(renderer);
    return { renderer, backend: "webgpu" };
  } catch {
    renderer.dispose();
    const fallback = options.create(true);
    await options.initialize(fallback);
    return { renderer: fallback, backend: "webgl2" };
  }
}

async function initializeRenderer(renderer: THREE.WebGPURenderer) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    renderer.init(),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Renderer initialization timed out.")), 5_000);
    }),
  ]).finally(() => clearTimeout(timeout));
}

export function createCompatibleRenderer(
  parameters: WebGLRendererParameters,
): Promise<THREE.WebGPURenderer> {
  const canvas = parameters.canvas;
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("City requires an HTML canvas renderer surface.");
  }
  const existing = rendererByCanvas.get(canvas);
  if (existing) return existing;

  const created = (async () => {
    const forceWebGL = new URLSearchParams(window.location.search).has("forceWebGL");
    const { renderer } = await initializeWithFallback({
      forceWebGL,
      create: (useWebGL) =>
        new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: useWebGL }),
      initialize: (next) => initializeRenderer(next),
    });
    return renderer;
  })();

  rendererByCanvas.set(canvas, created);
  created.catch(() => {
    rendererByCanvas.delete(canvas);
  });
  return created;
}
