# M3.6.1 — Pedestrian sidewalks

## IDs and inputs

**Milestone:** M3.6.1. **Requirements:** SIM-002–004 (amended), SIM-007–010, GEN-022 (amended), GEN-026–027, DAT-008–009, FUN-040–041, TST-001–003, TST-008. Inputs are merged M3.6 documents (generator `0.5.0`), occupied road cells, street-bounded blocks, Kenney `roads:tile-low`, local `*-path` and avenue unsuffixed junction tiles, and ADR-0013. This milestone does not start M4.

## Outputs and tasks

- After flood-fill blocks, mark a 1-cell sidewalk ring on every **habitable** manzana cell that is 4-adjacent to occupied roads (parks with an interior included; mask-edge rings may be incomplete). Persist `sidewalks` on `CityDocumentV1` with `roads:tile-low`. Do not open a local street that would leave a manzana thinner than 3 cells. Remnants that would be all-ring become pocket parks (no `tile-low`, trees on the grass).
- Pack lots inward of that ring so frontage is on sidewalk cells that themselves front a road (GEN-022). Occupy sidewalks in the placement spatial hash so buildings, trees, and decoration do not sit on the ring.
- Resolve **local** T and 4-way tiles to Kenney `road-intersection-path` / `road-crossroad-path`. Arterial/collector T and 4-way tiles use unsuffixed `road-intersection` / `road-crossroad` so catalog connectors match occupied neighbors. Treat local path cells plus their arms, avenue junction cells plus their arms, sidewalk corners, and the four approach cells of a 3×3 roundabout as pedestrian crossings. Do not place mid-block `road-crossing` tiles or Kenney `*-line` (corner cubes). `road-straight` is only for through-segments.
- Default walk policy is the 4-connected sidewalk ∪ crossing graph (one component). A* stays on cells. Reservation is per `(cell, lane)` with two right-hand lanes so two agents can pass. Spawn on sidewalk cells only. Carriageway cells that are not crossings are not walkable.
- Instance sidewalk tiles like roads. Keep agents as runtime-only (DAT-008). Bump `GENERATOR_VERSION` to `0.6.3`.

## Verification and evidence

TST-001/003: golden hash under generator `0.6.3`, 200-city batch, sidewalk rings on habitable blocks, no all-sidewalk manzanas, lots not overlapping sidewalks, sidewalk frontage, local `*-path` / avenue unsuffixed T/4-way, pedestrian graph connectivity. TST-008: sidewalk policy, two agents on one cell in different lanes, wait when both lanes reserved, ticks do not mutate the document. Manual QA: Chrome (Cursor Chromium) WebGPU and `?forceWebGL=1` on 96×96 `green-crossroads` — agents on the ring, avenue T/4-way openings without `*-line` cubes, path tiles only at local corners, two pedestrians passing, no mid-block asphalt walking.

## Exclusions and stop

No object editor, no user-controlled player, no walking lots/courtyards/park interiors, no mid-block crosswalks, no vehicle traffic, no mesh physics, no thousands of NPCs, no edits under `/assets`. Request review and stop before M4.
