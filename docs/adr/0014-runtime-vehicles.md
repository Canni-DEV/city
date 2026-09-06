# ADR-014: Explicit runtime vehicle network

**Status:** Accepted — 2026-09-06 for M3.6.2.

## Decision

Populate a small set of instanced Kenney Car Kit bodies at runtime from the open `CityDocumentV1`. Vehicles are not `CityEntity` records, are not written to `.city.json`, and are not part of the generator document hash except through persisted road topology.

Generator `0.6.7` stores resolved `RoadTopology` inside `CityDocumentV1.roadGraph.topology`: sections, tile references, lane pairs, directional ports, required movements, and external portals. Deterministic IDs reference placed road tiles. The field is included in the structural hash. This supersedes a `(cell, heading)` carriageway graph inferred at runtime and the earlier restriction that M3.6.2 keep generator `0.6.6`. Empty documents may omit topology. There is no inferred fallback graph, no circulation mode for older generators, and no migration that synthesizes topology.

The generated asset catalog measures traversable road surface from upward-facing GLB triangles at a reviewed surface height, and measures vehicle body bounds including node-hierarchy translations and pivots. Original assets under `/assets` are untouched. A rectangular footprint is not a drivable polygon.

`@city/core` reconstructs one `DriveNetwork` from topology plus catalog `driveProfile` / `vehicleBounds`. Straight and cubic Bézier paths join with matching positions and tangents and are parameterized by arc length via deterministic adaptive subdivision. Vehicle yaw follows the path derivative. Right-hand traffic: two senses on a one-cell street, one sense per paired avenue cell. Junctions (including dual-avenue nudos) are resolved units whose turns connect entry and exit ports inside the junction. A 3×3 roundabout is a shared continuous counterclockwise ring with tangent joins; the measured raised island is never traversed.

The complete catalog body envelope, at each entry’s existing `uniformScale` and pivot, must fit the measured surface and valid mask. Numerical tolerance is `0.001` cells (`DRIVE_TOLERANCE`). Opposing-lane encroachment on a tight turn is allowed while vehicles ghost. Curb, island, sidewalk, and off-mask traversal is not allowed.

Generation repairs missing reciprocal openings and incomplete avenue transitions with stable local catalog-tile edits **before** sidewalks, lots, and buildings. The search prefers the fewest changed cells with a stable tie-break. Failed lane or clearance validation retries under GEN-024 (at most three deterministic attempts) and never returns a partial city. No required maneuver is dropped to make a city pass. External gates are portals: a vehicle that exits is reinserted at another entry with the same runtime identity. Internal terminals require a physically valid return.

A* searches directed segments with length cost and deterministic tie-breaks (zero heuristic is admissible). Destinations are reachable lane segments or external exits, never intermediate turn connectors. Motion consumes the full elapsed distance across one or more segments without discarding remainder at joins. Count, speed, instancing, and ghost travel remain the M3.6.2 budgets (SIM-014, SIM-016, REN-010).

Derived pedestrian crossing IDs and intersection zones associate lane segments with existing sidewalk crossings. Pedestrian movement and reservation rules are unchanged. Network data, mobile runtime state, and rendering stay separate so a later ECS can reference segment IDs without depending on Three.js.

The city view shares one reconstructed `DriveNetwork` between the mover, the Traffic lanes overlay, and the keyboard-accessible inspector. Diagnostic selection is not persisted and does not edit roads or select vehicles.

## Consequences

City-kit generation, golden hashes, and export stay static except for persisted topology and any local road-tile repairs. Catalog tests (TST-006) include 11 `cars:*` bodies plus measured `driveProfile` / `vehicleBounds`. Massive traffic, mesh physics, braking, signals, reservations, parking, wheel meshes, road editing, and M4 remain out of this milestone. No ECS components are introduced. Old `0.6.6` snapshots remain loadable without silent regeneration (ADR-005) but are not vehicle-enabled. This decision does not replace ADR-003, ADR-006 (instancing of city kits and vehicles), ADR-008, ADR-012, or ADR-013.
