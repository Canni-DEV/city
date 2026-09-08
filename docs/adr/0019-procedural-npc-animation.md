# ADR-0019: Procedural NPC animation authority and runtime control

**Status:** Accepted — 2026-09-08

## Decision

The standalone `procedural-animations/` project is absorbed as the workspace package `@city/procedural-animation`. Its source, tests, root and `/physics` exports, README, and review guidance remain represented in the monorepo; duplicate character assets and nested build/lock metadata do not. `packages/assets/generated/characters` remains the catalog-managed character source. Three.js is aligned to City `0.185.x`, and Rapier remains an optional, development-lab-only dependency.

Authority is split explicitly. `@city/core` remains authoritative for NPC position, navigation, collision avoidance, swept separation, valid-mask/pedestrian-surface containment, safe crossing admission, fixed-tick behavior, and deterministic orchestration. `@city/procedural-animation` poses a loaded rig from actual core motion and may emit a bounded root-motion request. Core accepts, clips, or rejects that request against the same constraints; animation never commits world movement independently. Web owns transient actor registration, input, selection highlighting, interpolation, and camera composition.

NPC selection and manual control are runtime diagnostics, not M4 object editing. They never create `CityEntity` records, editor commands, undo history, autosave state, migrations, or hash input. Manual and autonomous actors use the same core mover. The follow camera is a perspective orbit-follow camera targeting the selected actor, not a head-mounted camera.

## Consequences

`CityDocumentV1`, generator `0.9.0`, document hashes, and exports remain byte-for-byte unaffected by animation/control ticks. Existing `0.8.1` and `0.9.0` documents load without regeneration. Ragdoll, attacks, jump, crouch, damage, Rapier simulation in City, and persistent NPC state remain out of scope. This ADR amends ADR-0012 only where that decision described runtime NPCs as non-selectable or prohibited follow/manual diagnostic control; it preserves the runtime-only persistence boundary.
