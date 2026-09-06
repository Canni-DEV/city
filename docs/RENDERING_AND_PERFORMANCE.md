# Rendering and performance

- **REN-001:** React Three Fiber initializes `WebGPURenderer` asynchronously. On WebGPU failure it recreates the renderer once with forced WebGL 2 and displays a notice. The city workspace is a definite CSS grid (`minmax(0, 1fr)` row and viewport column); the canvas wrapper fills that cell. After `init()`, drawing-buffer size is taken from that layout. Concurrent `gl` factories share one renderer per canvas. Backend is reported from the initialized renderer, not from inside the factory.
- **REN-002:** The open `CityDocument` survives renderer recreation because rendering owns no authoritative domain state.
- **REN-003:** The diagnostic shows active backend and Auto/Low/Medium/High quality.
- **REN-004:** Entities group by asset and texture variant in `InstancedMesh`; a stable bidirectional map links `instanceId` and entity ID.
- **REN-005:** Selection uses a non-instanced proxy for outline and gizmo rather than breaking instance batches.
- **REN-006:** Shared visual profile includes fixed sun, ambient light, nearby shadows, soft fog, and selection with no heavy post-processing.
- **REN-007:** Materials and node features must work on both backends; avoid incompatible `ShaderMaterial`, `EffectComposer`, and helpers.
- **REN-008:** Quality adjusts shadows, distance, fog, decoration, LOD, agent count, and vehicle count without changing the document.
- **REN-009:** Runtime agents use per-instance `SkinnedMesh` and `AnimationMixer` (idle/run). Each mixer clones its clips so interpolants are not shared across agents. Generated character GLBs store Kenney Idle/Run, not the FBX `0.Targeting Pose`. Agent materials are `MeshStandardNodeMaterial` with a per-skin map so WebGPU and the WebGL 2 fallback can deform the skeleton. City-kit buildings and roads stay instanced (REN-004). Agent source FBX is never shipped; only generated GLB and PNG enter the runtime copy.
- **REN-010:** Runtime vehicles use `InstancedMesh` grouped by catalog `assetId`. Pose comes from `tickVehicles` each frame (`vehicleWorldPose` on the shared `DriveNetwork`). Materials are `MeshStandardNodeMaterial` with the Kenney colormap so WebGPU and the WebGL 2 fallback match. Vehicles are not selectable. Car Kit bodies have no wheel meshes in M3.6.2. The Traffic lanes overlay draws grouped line geometry from the same network (sampled Bézier axes, direction arrows, surface boundaries, portals, crossing marks) without post-processing; unmounting the overlay releases that geometry.

For local/manual fallback QA, add `?forceWebGL=1` before the hash route (for example, `/city/?forceWebGL=1#/dev/assets`).

## Budgets

- **AC-010:** 60 FPS at 1920×1080 for a representative 96×96 city on a modern integrated-GPU laptop, including the M3.6 budget of 8–16 skinned agents and the M3.6.2 budget of 8–16 instanced vehicles on Auto/high.
- **AC-011:** A 128×128 generation completes with placed entities on the reference device. The five-second wall-clock budget no longer applies once traffic validation is in the pipeline; Node proves completion, not a 5 s cap. Frame-rate remains AC-010. An async loading spinner is deferred.
- **AC-012:** No redundant FBX, OBJ, previews, or source HTML appears in the production bundle.

### M3 recorded observations

Record device, browser, backend, quality, city size, entity count, frame-rate observation, generation duration, and screenshot in milestone PR evidence.

- **Device / runtime:** Windows development host; Node generator tests; Vite production copy of catalog GLB/PNG runtime files including generated protagonist GLBs and skins (no FBX, OBJ, or source HTML).
- **AC-011 generation:** A 128×128 Balanced city completes in Node (automated) without a five-second wall-clock gate. GEN-029 traffic validation typically takes longer than the former M3 budget; the 200-city preset/size batch still proves occupancy and placement, not a 5 s cap.
- **AC-010 frame rate:** Diagnostics expose FPS, entity count, pedestrian count, sidewalk count, and draw calls after generation. Cursor Chromium QA on this host (96×96 Balanced, seed `green-crossroads`, generator `0.6.3`): WebGPU Auto/high with 12 agents, 1437 sidewalks, 1001 road cells, 0 `*-line` tiles, local `*-path` only at neighborhood T/4-ways (22 tiles: 7 `road-intersection-path` + 15 `road-crossroad-path`), avenue T/4-way as unsuffixed `road-intersection` (168) and `road-crossroad` (24), and 766 `road-straight` through-segments; `?forceWebGL=1` Auto/medium reports WebGL2, same occupancy, ~72 fps. Agents stay on the gray ring, not mid-block asphalt. Edge was not driven separately (same Blink family as the Chrome harness). Generator `0.6.6` stitches dual L/T/4-way occupancy blocks, uses `road-crossroad` on 2×2 cells with four openings, and places 3×3 `road-roundabout` on 1-cell-wide local 4-ways; regenerate for current tile counts.
- **AC-012 bundle:** `apps/web/dist/runtime-assets` contains only catalog-referenced GLB models and PNG textures (city kits plus generated protagonist GLBs and four skins; no FBX).

The M3.6.2 Traffic lanes diagnostic draws grouped line geometry directly from `DriveNetwork`, including sampled Bézier lanes, direction arrows, surface boundaries, portal marks, and pedestrian crossing references. Selection highlights connected segments. Geometry is released on overlay unmount. Vehicles use the same arc-length geometry and exclude wheel nodes. Record generation and overlay on/off performance for generator `0.6.7` in the milestone PR; earlier `0.6.3`/`0.6.6` timings do not establish the new budgets.

M3.6.3 replaces separate layer ticks with a shared fixed-step runtime owner. Pedestrian poses, yaw and vehicle poses interpolate between ticks (portal recycle does not interpolate across the city). Idle/run weights blend over 0.2 s; playback follows speed. The scale override is 0.75. Pedestrian navigation uses grouped lines and sample marks; disabling it disposes diagnostic geometry. Counts retain SIM-006/016 and AC-010. Manual evidence is recorded in the M3.6.3 brief; no unmeasured FPS claim is implied.

M3.6.3 owner handoff: visual QA, backend parity, close-up recordings and AC-010/64+64 measurements are explicitly delegated to the owner at their request. See the manual checklist in milestones/M3_6_3_NPC_REFACTOR.md. Static checks do not establish those acceptance criteria.
