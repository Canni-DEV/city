# ADR-0018: Lot-yard occupancy and dumpsters

**Status:** Accepted — 2026-09-07

## Decision

M3.7.3 places suburban/urban yard and courtyard props as `CityEntity` records. Trees, planters, `suburban:path-short`, `suburban:fence-low`, and lot dumpsters each claim a **unique** spatial-hash cell. They stay in-mask, off occupied road and sidewalk cells, and inside a suburban or urban block. Occupying trees and planters may use a deterministic sub-cell offset inside that cell; `path-short` stays cell-centered; `fence-low` yaws along the lot edge; dumpsters inset toward the rear-inner corner.

`roads:dumpster` on a **sidewalk** remains ADR-0016 curb furniture (shared sidewalk occupancy, GEN-030 commercial/industrial only). The same asset on a **lot cell** is not curb furniture for GEN-011: it occupies uniquely and must not sit on a sidewalk or carriageway. GEN-011 therefore branches dumpster validation on whether the entity’s cell is a sidewalk.

Yard and courtyard cells are not pedestrian walkable (SIM-002). Pathfinding is not rewritten. This does not replace ADR-0016 or ADR-0017.

## Consequences

Leftover GEN-010 skips suburban and urban cells so courtyards and backyards stay free for `blockYards`. Nature Kit stays park-only. Building footprints, road tiles, curb furniture streams, and park interiors are unchanged aside from leftover candidate-pool shrinkage (same class of effect as M3.7.2). M4 may edit these entities like other decoration.
