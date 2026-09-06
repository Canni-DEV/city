# Changelog

All notable changes use Semantic Versioning. The project remains in `0.x` until M0–M6, intermediate M3.5/M3.6/M3.6.1/M3.6.2, and every 1.0 acceptance criterion are complete.

## [Unreleased]

### Added

- M3.6.2 runtime vehicles: seeded Kenney Car Kit bodies drive a persisted, validated directed lane network (cubic Bézier maneuvers, CCW roundabout rings, portals, and physical terminal returns) with A*, arc-length pose, and `InstancedMesh` batches. Vehicles stay outside `CityDocumentV1`. Bodies have no wheels this milestone.
- Traffic lanes overlay (off by default) and a keyboard-accessible inspector share the reconstructed `DriveNetwork` with the mover. Selection is diagnostic only.
- Catalog `driveProfile` (measured carriageway triangles and local ports) and `vehicleBounds` (pivot-aware body envelope) for road tiles and the 11 `cars:*` entries.

### Changed

- Generator `0.6.7`: after tile resolution, repair local openings/transitions, persist `roadGraph.topology`, and validate required maneuvers plus whole-body clearance before sidewalks and land. Failed networks retry under GEN-024 and never return a partial city. Old `0.6.6` cities load without silent regeneration; they are not vehicle-enabled and have no inferred fallback graph.
- Car Kit `uniformScale` fits body length to about 0.67 cells (~25% smaller than the first M3.6.2 fit).
- Generator `0.6.6`: the 3×3 Kenney roundabout sits on 1-cell-wide 4-ways (local streets and remnant arterials) according to the Roundabouts control. Dual-avenue 4-ways stay unit `road-crossroad`. Old `0.6.5` cities load without silent regeneration.
- Generator `0.6.5`: dual avenue L/T/4-way nudos stitch 1-cell gaps into occupancy blocks; dual T/4-way 2×2 cells with four openings use `road-crossroad`; a dual elbow counts the lane-mate as the other leg of the turn. Old `0.6.4` cities load without silent regeneration.
- Generator `0.6.4`: arterial and collector corridors occupy two adjacent cells. Parallel 1-cell axes that already touch collapse into that pair instead of a 3-cell slab; remaining runs dilate only when that does not merge corridors. Tile topology ignores the lane-mate so `road-intersection` / `road-crossroad` appear only at real crossings. Local streets stay one cell. Resolved road cells may record `roadClass`. Old `0.6.3` cities load without silent regeneration.

## [0.7.0] - 2026-09-05

### Added

- M3.6.1 sidewalk rings: each habitable manzana keeps a 1-cell paved perimeter (`roads:tile-low`) persisted on `CityDocumentV1`. NPCs walk that ring plus local Kenney `*-path` corners and unsuffixed avenue T/4-way openings on two logical lanes.

### Changed

- Generator `0.6.3`: lots pack inward of the sidewalk; local T/4-way tiles use pedestrian path meshes; avenue T/4-way tiles use unsuffixed Kenney `road-intersection` / `road-crossroad` (catalog connectors match neighbors; no `*-line` corner cubes); local streets do not open slivers thinner than a sidewalk+lot+sidewalk; leftover slivers are pocket parks.

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

