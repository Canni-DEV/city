# M3.8 — Procedural NPC animation and control

## IDs and inputs

**Milestone:** M3.8. **Requirements:** FUN-040/044 (amended), FUN-048, UX-011/026 (amended), UX-027, SIM-027–030, REN-011, TST-013, ADR-0019. Read the [Functional](../FUNCTIONAL_SPEC.md), [UX](../UX_SPEC.md), [Simulation](../SIMULATION_SPEC.md), [Architecture](../ARCHITECTURE.md), [Data model](../DATA_MODEL.md), [Rendering](../RENDERING_AND_PERFORMANCE.md), [Asset catalog](../ASSET_CATALOG.md), [Testing](../TESTING.md), and [ADR-0019](../adr/0019-procedural-npc-animation.md). Branch: `milestone/m3-8-procedural-animation`. Inputs are the M3.6.3 runtime NPC world, M3.6.2 traffic-safe crossings, the catalog-managed protagonist GLBs/skins, and the formerly standalone `procedural-animations/` source.

M3.8 changes no `CityDocumentV1` field, migration, generator stage, catalog entry, generator `0.9.0` output, or structural hash. NPC selection, control, animation, and cameras are disposable runtime state. This milestone does not begin M4.

## Functional contract

Every spawned NPC uses an `@city/procedural-animation` avatar and receives an `idle`, `walk`, `run`, or `greet` directive derived from actual fixed-tick motion. Walk speed remains seeded `0.33 cells/s ±10%`; run speed is `0.75 cells/s` with the same variation. Safe admitted crossing legs run to completion when enabled, then return to walking. Fixed-tick, seed/ID-based stationary NPC greetings use a `0.9`-cell radius and deterministic 8–18 second cooldown; manual greet has priority and greetings never reserve space or interrupt crossings.

Every visible NPC is selectable by its enlarged viewport target or stable runtime ID. Selection alone changes neither autonomy nor camera. **Control NPC** enters manual mode and an orbitable perspective follow camera. WASD/arrows move camera-relative, Shift runs, V greets, X stops, Tab releases to city orbit while preserving selection, and Escape releases and clears selection. F toggles free flight only outside NPC control. Editable fields never consume gameplay keys. Manual motion uses the same mask, surface, obstacle, swept-separation, network-edge, and traffic-admission rules as autonomous motion. Stop, release, and route changes requested during an admitted crossing are deferred until its complete leg ends.

Camera modes are `cityOrbit`, `freeFlight`, and `npcFollow`. Follow uses a 50° perspective camera, `0.05` near plane, `mapSize × 16` far plane, damped OrbitControls, interpolated hip/root targeting, and an initial offset near `[2.3, 1.3, 3.0]`. Removing the NPC or changing the document resets control/follow state safely.

Development builds expose a lazy `/dev/animations` lab and a home-page card. It supports profile and gait tuning, procedural beats, pause/step/reset, skeleton/IK inspection, a 50-avatar load mode, and benchmark export. Production has no route/card or reachable lab/Rapier chunk; the City viewport never constructs a Rapier world.

## Technical contract

- `packages/procedural-animation` is workspace package `@city/procedural-animation`; it owns root and `/physics` exports, preserved tests/docs, Three `0.185.x`, and an optional Rapier peer. Character assets remain canonical in `packages/assets/generated/characters`.
- Its non-physics `AnimatedCharacter` facade owns fixed pose capture and render interpolation: `fixedUpdate`, `playBeat`, `updateVisual`, status, bounded motion requests, and disposal. City does not instantiate `ProceduralCharacter` physics.
- `@city/core` owns `NpcControlState`, `NpcAnimationDirective`, `NpcOrchestrationConfig`, deterministic social scheduling, crossing-run behavior, validated commands, and procedural motion-request validation. `tickNpcWorld` remains the only motion integrator and imports no Three.js.
- The web simulation registry is keyed by stable NPC ID. At each fixed tick it applies the prior bounded motion request, ticks pedestrian/vehicle worlds, resolves directives, feeds actual pose/velocity/attention and one-shot sequences to actors, then stores the next request. Render frames call `updateVisual(alpha)`.
- Population changes preserve surviving components. Missing IDs, non-finite inputs, regeneration, and document open clear affected runtime state without partial mutation or stale actors.

## Verification and stop

TST-013 covers deterministic configuration/orchestration, velocity-driven transitions, greeting pairing/cooldowns/sequence priority, bounded manual motion and separation, safe crossing admission and full-leg running, deferred stop/release, accepted/rejected procedural requests without debt, document/hash identity, selection/input/camera cleanup, fixed-step equivalence/interpolation, legacy package tests on Three `0.185.x`, and production lab exclusion.

Run `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`. `pnpm test:batch` is not required because no generator, occupancy, network geometry, or persisted topology changes.

Owner QA: generate Balanced 96×96 `green-crossroads` with 12 pedestrians/12 vehicles, then 64/64. In Chrome and Edge at 1280×720 and 1920×1080, exercise WebGPU and forced WebGL 2; verify all NPCs select, Control is explicit, animation transitions/crossings are safe, Tab/F/Escape are unambiguous, pause/step stays synchronized, and regeneration leaves no stale actor. Record FPS/draw calls at 12 and 64 NPCs. Run the animation-lab 50-NPC benchmark and record p95, targeting ≤4 ms on the review machine without treating that hardware result as universal.

Attach automated output and owner browser/performance notes to review. Owner recorded a successful manual review of selection, Control NPC, follow camera, walking gait, and the animation lab on this delivery. Numeric FPS/draw-call/p95 measurements were not attached to the branch. Stop for review before M4.
