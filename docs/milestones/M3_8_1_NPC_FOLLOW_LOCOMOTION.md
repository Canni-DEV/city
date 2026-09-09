# M3.8.1 — Third-person NPC follow and locomotion recovery

## IDs and inputs

**Milestone:** M3.8.1. **Requirements:** UX-011/027 (amended), REN-011 (amended), SIM-004/022 (amended), TST-013 (amended), ADR-0019 (amended). Read the [UX](../UX_SPEC.md), [Simulation](../SIMULATION_SPEC.md), [Rendering](../RENDERING_AND_PERFORMANCE.md), [Testing](../TESTING.md), and [ADR-0019](../adr/0019-procedural-npc-animation.md). Branch: `milestone/m3-8-1-npc-follow-locomotion`. Inputs are the M3.8 runtime NPC world, `npcFollow` camera, and city orthographic orbit. This patch does not begin M4.

M3.8.1 changes no `CityDocumentV1` field, migration, generator stage, catalog entry, generator `0.9.0` output, or structural hash. Camera look state and yield timers are disposable runtime state.

## Functional contract

`npcFollow` is a locked third-person camera: perspective 50°, `0.05` near plane, `mapSize × 16` far plane, targeting the interpolated hip/root, placed behind and above the NPC yaw. Default distance is `2.6` cells (wheel `1.2…8`). Right-drag looks around the hip; Q/E yaws the look; releasing the right button or starting WASD/arrow movement springs yaw/pitch back behind the character while preserving wheel distance. WASD stays camera-relative. F remains ignored during control. Tab/Escape still return to `cityOrbit`. The camera is not head-mounted and does not collide with buildings.

City orbit keeps default zoom `9` and `minZoom` `3`. OrbitControls `maxZoom` is `96` so streets can be inspected at sidewalk scale.

Autonomous pedestrians keep wander, 1–3 second arrival waits (skipped on crossing approaches), and greetings except in crossing waits, yields, crossing approaches, or crowds of three or more. Local avoidance adds headings `±0.9` and a walk-speed lateral sidestep after those fail. Mutual proposal collisions stop only the lower-priority mover: manual control outranks autonomous, an admitted crossing outranks a sidewalk waiter, then lexicographically smaller ID proceeds (`npc:0` before `npc:1`). Intermediate legs complete within `0.32` cells so crowds do not occupy the exact corner node. Crossing admission ignores sidewalk waiters on the approach; same-direction followers may enter once the leader is `0.75` cells ahead. Waiters stand on sidewalk queue slots. Yielding that lasts `1.5` seconds replans to the same destination; after `3` seconds wanderers pick a new mid-block destination, including when stuck waiting to cross. Admitted crossings, crossing waits, manual control, and missing destinations do not repath at `1.5` seconds. Crossing blocks still repath at ten seconds. Inspector reasons distinguish another pedestrian from a boundary.

## Technical contract

- Web owns the third-person rig in `NpcFollowCamera` without OrbitControls. Framing helpers in `camera-mode.ts` stay Three-free. `useFrame` priority stays `<= 0`.
- `@city/core` remains the sole integrator. `NpcBehavior.yieldSeconds` is runtime-only. `tickNpcWorld` applies sidestep, priority resolution, and yield repath; it still imports no Three.js.
- Deterministic: identical seed, IDs, config, and fixed ticks produce identical poses, yield timers, and routes.

## Verification and stop

TST-013 covers third-person framing behind yaw, spring-back helpers, no OrbitControls on follow, city `maxZoom` 96, `useFrame` priority `<= 0`, 1-cell sidewalk opposing pass, four-NPC congestion recovery, destination-preserving yield repath, priority (ID and manual), and no 1.5 s repath during an admitted crossing.

Run `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`. `pnpm test:batch` is not required.

Owner QA: generate Balanced 96×96 `green-crossroads` with 12 pedestrians/12 vehicles, then 64/64. Control an NPC and confirm locked third-person follow, right-drag look that returns on release or movement, and wheel distance. Zoom the city camera until sidewalks fill the view. Confirm autonomous NPCs do not remain in Yielding for most of a session. Stop for review before M4.
