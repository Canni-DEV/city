# Rendering and performance

- **REN-001:** React Three Fiber initializes `WebGPURenderer` asynchronously. On WebGPU failure it recreates the renderer once with forced WebGL 2 and displays a notice.
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

Record device, browser, backend, quality, city size, entity count, frame-rate observation, generation duration, and screenshot in milestone PR evidence.
