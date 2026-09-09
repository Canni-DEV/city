# M3.9 — Cinematic entry experience

## IDs and inputs

**Milestone:** M3.9. **Requirements:** PRD-005/006 (amended), FUN-030 (amended), FUN-049, UX-001 (amended), UX-028, ACC-006/007, REN-001/002, REN-012, TST-014, ADR-0020. Read the [Product](../PRODUCT_SPEC.md), [Functional](../FUNCTIONAL_SPEC.md), [UX](../UX_SPEC.md), [Accessibility](../ACCESSIBILITY.md), [Architecture](../ARCHITECTURE.md), [Rendering](../RENDERING_AND_PERFORMANCE.md), [Testing](../TESTING.md), [Deployment](../DEPLOYMENT.md), and [ADR-0020](../adr/0020-cinematic-hybrid-experience.md). Branch: `milestone/m3-9-cinematic-experience`. Inputs are generator `0.9.0`, the shared generation worker, the M3.8.1 runtime NPC world and follow camera, and the existing WebGPU→WebGL 2 renderer fallback.

M3.9 changes no `CityDocumentV1` field, migration, generator stage, catalog entry, generator output, or structural hash. The experience document remains local to the route until explicit handoff; camera, scroll, selection, greeting and transition state are disposable runtime state. This milestone does not begin M4.

## Functional and visual contract

Production exposes the unlinked `#/experience` route without normal application chrome. It renders a five-viewport native-scroll editorial sequence with a fixed R3F canvas masked inside the independently addressable point of an inline vector `City` wordmark. Scroll remains native and reversible; no orbit, pan or wheel handler owns the cinematic camera. The mask expands and the perspective camera follows deterministic keyframes from city overview to an elevated one-block/intersection view.

The route generates a Balanced 96×96 `Green Crossroads` document with seed `green-crossroads`, using the existing worker and progress/error contracts. It runs 12 pedestrians and 12 vehicles. A deterministic web-only composition score chooses a central, low-occlusion NPC near an intersection; that NPC waits under manual stop while the rest of the city runs, greets once after the final act begins, and exposes an accessible `Meet me` control. Activation adopts the exact document identity, navigates to its City route, validates the transient NPC ID and enters locked `npcFollow`. Invalid entry state safely retains city orbit.

Generation and rendering do not start below 1280×720. Reduced-motion desktop users receive the same generated final composition without scroll/mask/transition animation and an `Explore the city` control. Loading gates the reveal at progress 0.28 until generation, essential assets and two rendered frames are ready; errors offer Retry and Back to library. Leaving the experience before handoff never replaces the application store document.

## Technical contract

- Web owns a shared generation-worker hook with active-request filtering and cancellation; City generation behavior remains unchanged.
- `CityScene` remains the shared renderer. The experience supplies its own perspective camera and DOM hero prompt, while the normal `cityOrbit`, `freeFlight` and `npcFollow` paths retain their controls.
- Timeline, scroll normalization, camera frames, hero scoring and transient entry validation are pure/testable helpers. No new dependency, original asset change, persistence field, telemetry, server or audio is added.
- View Transitions provide a 320 ms handoff when available, with a CSS opacity fallback and a no-motion path.

## Verification and stop

TST-014 covers scroll clamping/gating/reversibility, finite camera frames, deterministic non-mutating hero selection, exact document adoption, transient-entry validation/fallback, production route isolation, desktop/reduced-motion branches and native scroll. Existing renderer fallback and NPC suites cover backend recovery, greeting/control and document immutability.

Run `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`. `pnpm test:batch` is not required because generation, occupancy and topology are unchanged.

Owner QA: Chrome and Edge, WebGPU and forced WebGL 2, 1280×720 and 1920×1080. Verify SVG/dot alignment, wheel/trackpad/keyboard/reverse scroll, slow loading and retry, no orbit, live 12+12 scene with a stationary hero, one greeting, keyboard focus, crossfade and immediate control of the same NPC. Verify reduced motion and the unsupported-viewport notice. Record FPS/draw calls. Stop for review before M4.

## Implementation evidence

- Automated on 2026-09-09: `pnpm check`, `pnpm typecheck`, `pnpm test` (119 core, 30 web, 24 procedural-animation and 10 asset tests), `pnpm build`, and `git diff --check` pass. The check retains only previously documented repository warnings. TST-014 is included in the 30 web tests.
- Chromium/WebGPU smoke QA at 1314×900: the city aligns with the independent SVG dot; native forward and reverse scrolling reaches the live final composition; `Meet me` is keyboard-addressable; handoff adopts the generated city without regeneration and opens `npc:9` in manual `npcFollow` with the 12+12 runtime intact.
- The review pass still needs the owner matrix above on standalone Chrome and Edge, forced WebGL 2, both exact target resolutions, reduced motion, constrained viewport, slow-worker failure/retry, and recorded experience FPS/draw calls.
