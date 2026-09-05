import { extend } from "@react-three/fiber";
import type { WebGLRendererParameters } from "three";
import * as THREE from "three/webgpu";

extend(THREE as unknown as Parameters<typeof extend>[0]);

export type RendererBackend = "webgpu" | "webgl2";

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
  return renderer;
}

export async function createCompatibleRenderer(
  parameters: WebGLRendererParameters,
  report: (backend: RendererBackend) => void,
) {
  const canvas = parameters.canvas;
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("City requires an HTML canvas renderer surface.");
  }
  if (new URLSearchParams(window.location.search).has("forceWebGL")) {
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
    await initializeRenderer(renderer, canvas);
    report("webgl2");
    return renderer;
  }
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  try {
    await initializeRenderer(renderer, canvas);
    report("webgpu");
    return renderer;
  } catch {
    renderer.dispose();
    const fallback = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
    await initializeRenderer(fallback, canvas);
    report("webgl2");
    return fallback;
  }
}
