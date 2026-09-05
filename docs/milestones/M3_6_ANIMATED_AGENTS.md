# M3.6 — Animated agents

## IDs and inputs

**Milestone:** M3.6. **Requirements:** SIM-001–007, PRD-006 (amended), AST-001–003 (character runtime), REN-009, TST-008, UX-002, UX-011. Inputs are merged M3.5 documents (`0.5.0`), occupied road cells, Kenney Animated Characters Protagonists 1.1 under `assets/kenney_animated-characters-protagonists/` (untouched FBX/PNG), and ADR-0012. This milestone does not start M4.

## Outputs and tasks

- Generate character GLB and clips **outside** `/assets` (for example `packages/assets/generated/characters/`) from the source FBX; copy only GLB/PNG into runtime (AC-012).
- Extend the catalog beyond the 213 city-kit GLBs with protagonist body, idle/run clips, and four skins. Optional agent-only scale override.
- Build a walk graph from occupied road cells; spawn 8–16 seeded agents; A*, cell reservation, wait-then-repath.
- Render each agent as a cloned `SkinnedMesh` with `AnimationMixer` (`idle` / `run`). Do not instance city-kit batches through these avatars.
- Keep the default city camera; raise OrbitControls `maxZoom` above 28. Optional inspect-only free camera (**F**) may use WASD; it is not a player. No jump playback.

## Verification and evidence

TST-008 covers graph construction, A*, reservation/wait/repath, seeded spawn, and that ticking agents does not mutate `CityDocumentV1`. Manual QA: Chrome/Edge, WebGPU and `?forceWebGL=1`, agents on streets, idle/run, two agents do not occupy one cell, extra zoom. Record that 8–16 skinned agents keep AC-010 plausible.

## Exclusions and stop

No object editor, no user-controlled player, no leaving the road graph, no parks/lots as walkable, no vehicle traffic, no mesh physics, no thousands of NPCs, no generator-version bump unless city-kit output changes (it must not). Request review and stop before M4.

## Completion evidence

- Character GLBs and clips are generated into `packages/assets/generated/characters/` from untouched Kenney FBX; runtime copy is GLB/PNG only (AC-012).
- Catalog keeps 213 city-kit GLBs and adds protagonist body, idle/run/jump clips, and four skins. Pedestrian height is baked to ~0.32 vs `commercial:building-a` (~1.293); city-kit scale is unchanged.
- `@city/core` exposes a `WalkPolicy` plus mover: occupied-road graph, A*, cell reservation with wait-then-repath, and spawn RNG from document seed + agent index. Agents never enter `CityDocumentV1`.
- The city canvas clones a `SkinnedMesh` per NPC (`AnimationMixer` idle/run with per-agent clip clones), keeps default zoom 9, and raises OrbitControls `maxZoom` to 48. **F** enables unrestricted free camera; default city orbit is unchanged. No player avatar or jump clip. Pedestrians walk at about one-third of a cell per second.
- TST-006/008, Biome check, typecheck, Vitest, and production build pass. Manual QA: Chrome (Cursor Chromium) WebGPU and `?forceWebGL=1` on 96×96 `green-crossroads` show 12 skinned NPCs on unique road cells, idle/run, `maxZoom` 48, credits pack list, and `#/dev/assets` `protagonists:character-medium`. Edge was not driven separately.
