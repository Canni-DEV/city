import { extend } from "@react-three/fiber";
import type { WebGLRendererParameters } from "three";
import * as THREE from "three/webgpu";

extend(THREE as unknown as Parameters<typeof extend>[0]);

export type RendererBackend = "webgpu" | "webgl2";

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

async function initializeRenderer(renderer: THREE.WebGPURenderer, canvas: HTMLCanvasElement) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    renderer.init(),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Renderer initialization timed out.")), 5_000);
    }),
  ]).finally(() => clearTimeout(timeout));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
}

export async function createCompatibleRenderer(
  parameters: WebGLRendererParameters,
  report: (backend: RendererBackend) => void,
) {
  const canvas = parameters.canvas;
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("City requires an HTML canvas renderer surface.");
  }
  const forceWebGL = new URLSearchParams(window.location.search).has("forceWebGL");
  const { renderer, backend } = await initializeWithFallback({
    forceWebGL,
    create: (useWebGL) =>
      new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: useWebGL }),
    initialize: (next) => initializeRenderer(next, canvas),
  });
  report(backend);
  return renderer;
}
