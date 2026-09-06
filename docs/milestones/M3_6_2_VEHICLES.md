# M3.6.2 — Explicit runtime vehicle lanes

## IDs and inputs

**Milestone:** M3.6.2. **Requirements:** SIM-011–019, GEN-029, DAT-008/010, FUN-042–043, UX-025, REN-008/010, AST-001/014, TST-002/003/006/009, AC-010/011/012, PRD-006. Read [Simulation](../SIMULATION_SPEC.md), [Generator](../GENERATOR_SPEC.md), [Data model](../DATA_MODEL.md), [Asset catalog](../ASSET_CATALOG.md), [UX](../UX_SPEC.md), [Rendering](../RENDERING_AND_PERFORMANCE.md), [Testing](../TESTING.md), and [ADR-014](../adr/0014-runtime-vehicles.md). Continue on `milestone/m3-6-2-vehicles`. This milestone does not start M4.

## Outputs

- Generator `0.6.7` persists resolved `RoadTopology` on `CityDocumentV1.roadGraph.topology` and repairs local road openings/transitions **before** sidewalks and land. Failed lane or clearance validation retries deterministically (GEN-024) and never returns a partial city.
- Catalog `driveProfile` and `vehicleBounds` are measured reproducibly from untouched GLBs via reviewed overrides. City-kit count remains 213 plus 11 `cars:*` bodies and protagonist assets. Footprints are not drivable polygons.
- Core derives one `DriveNetwork`: directed lanes, continuous cubic Bézier maneuvers, CCW roundabout ring/joins, physical terminal returns, and external portals. A* uses length cost; movement consumes distance across multiple segments without jumps. Whole-body clearance uses every catalog vehicle at its existing scale and pivot (`DRIVE_TOLERANCE` 0.001 cells). Opposing-lane encroachment on tight turns is allowed; curb/island/sidewalk/mask exit is not.
- Runtime vehicles, surfaces, caches, indexes, and diagnostic selection remain reconstructible and are never document fields.
- Traffic lanes overlay (off by default) and a keyboard-accessible inspector share the actual network with the mover. Pedestrian crossing associations prepare future simulation without ECS, signals, or new yielding rules.

## Verification and stop

Run `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. TST-009 covers endpoints/tangents, early turning, body clearance, directed connectivity, portals/returns, time partitioning, determinism, reconstruction, and document immutability. Default CI does not run the 200-city TST-002/003 occupancy census; run `pnpm test:batch` on occupancy or generator-mesh pull requests (no skipped seeds). Record Chrome/Edge and WebGPU/WebGL 2 QA at 1280×720 and 1920×1080, including overlay on/off for AC-010. AC-011 proves a 128×128 city completes; it does not enforce a five-second wall-clock budget.

No M4, ECS, signals, braking, wheel meshes, massive traffic, legacy circulation modes, or source asset edits. Stop for milestone review.

## Evidence

Implementation of the lane-network contract is on `milestone/m3-6-2-vehicles`. Attach the four pnpm commands, TST-002/003/006/009 results (golden hash under generator `0.6.7`), and manual overlay/performance evidence to the review PR before marking this brief complete.
