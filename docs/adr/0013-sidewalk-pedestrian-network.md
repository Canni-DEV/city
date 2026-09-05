# ADR-013: Sidewalk pedestrian network

**Status:** Accepted — 2026-09-05

## Decision

Persist a 1-cell sidewalk ring as a first-class `CityDocumentV1` collection (`sidewalks`), not as `CityEntity` records. Each sidewalk cell belongs to a **habitable** block, occupies a manzana cell 4-adjacent to occupied road, and renders with Kenney `roads:tile-low`. Lots pack inward of that ring and front the sidewalk. Blocks too thin to keep an interior after the ring are pocket parks (grass and trees, no `tile-low`).

Pedestrian walkability is the 4-connected union of sidewalk cells and junction crossings: local Kenney `*-path` T/4-way tiles plus their immediate road arms, arterial/collector T/4-way `road-intersection` / `road-crossroad` cells (real crossings; not dual-carriageway through-segments) plus their arms, sidewalk-corner road cells, and the four approach cells of a 3×3 roundabout. The carriageway is not walkable except those crossings. Runtime agents remain derived (seed + this graph), never stored, and still do not affect generator identity except through the new sidewalk and tile fields.

Two logical lanes per walkable cell (right-hand offset, capacity 2) replace exclusive cell reservation so agents can pass on a 1-cell sidewalk without mesh physics.

## Consequences

This supersedes the M3.6 / ADR-012 walk policy that bound agents to occupied road cells. It does not replace ADR-003, ADR-006, ADR-011, or ADR-012’s rule that agents are outside `CityEntity` / export. Generator version is `0.6.5` after dual-avenue junction stitch (ADR-011 amendment); lots shrink by the ring; Kenney street meshes keep their baked curb (the extra cell reads as a wide sidewalk). Dual T/4-way 2×2 cells with four openings use `road-crossroad`. Kenney `*-line` is not used. Vehicle traffic remains out of v1. M4 must not treat sidewalk tiles as selectable objects.
