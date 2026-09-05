# Rendering and performance

- **REN-001:** React Three Fiber initializes `WebGPURenderer` asynchronously. On WebGPU failure it recreates the renderer once with forced WebGL 2 and displays a notice. The city workspace is a definite CSS grid (`minmax(0, 1fr)` row and viewport column); the canvas wrapper fills that cell. After `init()`, drawing-buffer size is taken from that layout. Concurrent `gl` factories share one renderer per canvas. Backend is reported from the initialized renderer, not from inside the factory.
- **REN-002:** The open `CityDocument` survives renderer recreation because rendering owns no authoritative domain state.
- **REN-003:** The diagnostic shows active backend and Auto/Low/Medium/High quality.
- **REN-004:** Entities group by asset and texture variant in `InstancedMesh`; a stable bidirectional map links `instanceId` and entity ID.
- **REN-005:** Selection uses a non-instanced proxy for outline and gizmo rather than breaking instance batches.
- **REN-006:** Shared visual profile includes fixed sun, ambient light, nearby shadows, soft fog, and selection with no heavy post-processing.
- **REN-007:** Materials and node features must work on both backends; avoid incompatible `ShaderMaterial`, `EffectComposer`, and helpers.
- **REN-008:** Quality adjusts shadows, distance, fog, decoration, and LOD without changing the document.

For local/manual fallback QA, add `?forceWebGL=1` before the hash route (for example, `/city/?forceWebGL=1#/dev/assets`).

## Budgets

- **AC-010:** 60 FPS at 1920×1080 for a representative 96×96 city on a modern integrated-GPU laptop.
- **AC-011:** A 128×128 generation completes in under five seconds on the reference device.
- **AC-012:** No redundant FBX, OBJ, previews, or source HTML appears in the production bundle.

### M3 recorded observations

Record device, browser, backend, quality, city size, entity count, frame-rate observation, generation duration, and screenshot in milestone PR evidence.

- **Device / runtime:** Windows development host; Node generator tests; Vite production copy of 226 catalog GLB/PNG runtime files (no FBX, OBJ, or source HTML).
- **AC-011 generation:** A 128×128 Balanced city completes in under five seconds in Node (automated). The 200-city preset/size batch including 64/96/128 maps finished with the rest of the core suite in approximately 8.2 seconds.
- **AC-010 frame rate:** Manual Chrome/Edge 1920×1080 observations for WebGPU and forced WebGL 2, across Auto/Low/Medium/High, belong in the M3 review screenshots. Diagnostics expose FPS, entity count, and draw calls after generation.
- **AC-012 bundle:** `apps/web/dist/runtime-assets` contains only catalog-referenced GLB models and PNG textures.
