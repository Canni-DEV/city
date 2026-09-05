# Changelog

All notable changes use Semantic Versioning. The project remains in `0.x` until M0–M6, intermediate M3.5/M3.6, and every 1.0 acceptance criterion are complete.

## [Unreleased]

## [0.6.0] - 2026-09-05

### Added

- M3.6 runtime pedestrians: seeded NPCs walk the occupied road graph with A*, cell reservation, idle/run clips, and Kenney protagonist skins. Character GLBs are generated outside `/assets`.
- Optional free camera (**F**) for unrestricted city inspection; the default orbital city view is unchanged.

### Fixed

- Character GLB export picks Kenney `Root|Idle` / `Root|Run` instead of the first FBX clip (`Root|0.Targeting Pose`), which left walking NPCs in a T-pose.
- Agent mixers keep their clip bindings across React remounts so the city canvas does not crash when pedestrians start idle/run.
- Pedestrian travel speed is about one-third of a cell per second so the Kenney run cycle reads as a walk.

## [0.5.0] - 2026-09-05

### Fixed

- The first generated city is visible without resizing the window: the workspace gives the viewport a definite grid track, the canvas fills that cell, WebGPU init sizes from that layout instead of the HTML 300×150 default, and the factory does not report backend mid-init.

### Changed

- Generator `0.5.0` (M3.5): hierarchical arterial plus local block mesh, regularity as organic→grid orthogonality, connector-correct Kenney tiles, 2×2 avenue curves, street-bounded manzanas, and ring lots with courtyards.
- Road tile yaw follows Kenney identity (straights east–west, ends open east, T-junctions closed north, 90° bends and 2×2 curves open west+south) so sidewalks run along the street instead of across tile joints.
- Arterial through-segments use `road-straight` instead of `road-square`, which Kenney models as a four-sided curb plaza.
- Kenney roundabouts occupy a 3×3 footprint at arterial 4-way junctions so the circular mesh does not overlap neighboring 1×1 streets.
- Road occupancy and rendering expand catalog footprints so multi-cell tiles do not overlap lots or sit on the wrong pivot.

## [0.4.0] - 2026-09-04

### Added

- Deterministic M3 placement: footprint-valid buildings, park trees, decoration, district palettes, and spatial-hash occupancy checks.
- Instanced city rendering grouped by asset and texture variant, quality profiles Auto/Low/Medium/High, fixed sun/ambient/shadows/fog, and a one-time WebGPU→WebGL 2 fallback that keeps the open document.
- Worker `placement` and `decoration` stages, renderer fallback tests, and 200-city placement invariants.

## [0.3.0] - 2026-09-04

### Added

- Deterministic M2 land generation: flood-filled blocks, rectangular road-fronted lots, normalized advanced zone controls, and five-zone assignment within ±5 area points.
- Preset and advanced generator controls for zone mix, parks, districts, regularity, roundabouts, decoration, and theme.
- Independent zone, lot, and grid overlays with color-plus-pattern legends of actual versus target zone shares.
- Land invariant, golden-hash, cancellation, and 200-city preset/size batch tests covering frontage and quotas.

## [0.2.0] - 2026-09-04

### Added

- Deterministic M1 road generator with irregular masks, density fields, polycentric districts, external gates, Delaunay candidate graphs, spanning connections, cycles, A* routing, modular tile resolution, validation, and reproducible retries.
- Generation worker with progress, cancellation, active-request filtering, and validated public messages.
- Navigable road laboratory with Kenney models, readable road underlay, district and gate markers, and WebGPU/WebGL 2 diagnostics.
- Generator golden-hash, retry, and 200-city preset/size batch tests.

## [0.1.0] - 2026-09-04

### Added

- M0 monorepo, product specifications, public contracts, generated asset catalog, internal viewer, application shell, CI, and deployment workflow.

### Repository

- Established the public repository baseline and preserved the four original CC0 Kenney asset packs.
