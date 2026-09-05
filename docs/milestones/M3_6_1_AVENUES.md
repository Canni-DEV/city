# M3.6.1 hotfix — Two-cell avenues

## IDs and inputs

**Milestone:** M3.6.1 avenue carriageways (hotfix after sidewalks). **Requirements:** GEN-004–005 (amended), GEN-027 (amended), GEN-028, DAT-002, FUN-041, SIM-009, TST-001–003. Inputs are generator `0.6.3`, Kenney ground-level road tiles, and the M3.6.1 sidewalk ring. This is not M3.6.2 (vehicles). This milestone does not start M4.

## Outputs and tasks

Give AVENIDA geometry in the engine: arterial and collector corridors are two adjacent cells. Local streets stay one cell.

- Rasterize arterial/collector centerlines, then **assign** each run a 2-cell carriageway: adjacent parallel 1-cell axes collapse into that pair; remaining 1-cell runs dilate by one perpendicular cell only when that does not merge two corridors (`widenAvenueCorridors`). Dual corridors that sit one cell apart **stitch** into an L, T, or 4-way block (`stitchAvenueJunctions`). Gates occupy two border cells; one gate node stays at the original position. Remnant 1-cell avenues only when mask/bounds block the twin. Through-slabs of 3+ cells and 1-cell grass gaps between avenues are invalid.
- Resolve tiles from **logical** topology (GEN-028): the lane-mate is not a street on a through-run; at a dual elbow the mate is the other leg of the turn. Through dual runs use two `road-straight`. Dual T/4-way 2×2 cells with four openings use `road-crossroad`. Local T/4-way stay `*-path` except a 1-cell-wide 4-way may take 3×3 `road-roundabout` (GEN-005/027). Do not place `*-line` or `road-straight-half`.
- Keep searching for 2×2 `road-curve` on 1-cell-wide elbows and 3×3 `road-roundabout` on 1-cell-wide 4-ways (local streets and remnant arterials). Dual-axis elbows use unit `road-bend-sidewalk` (or unit tiles from physical connectors); dual 4-ways use unit tiles, not a roundabout.
- Sidewalk `tile-low` rings and the pedestrian graph follow the new occupancy. Crossing cells remain real junctions only. Bump `GENERATOR_VERSION` to `0.6.6`. Old `0.6.5` documents stay loadable without silent regeneration (ADR-005).

## Verification and evidence

TST-001/003: golden hash under generator `0.6.6`, 200-city batch, connector tests for dual carriageways (straight pair, one-sided T, through-local 4-way, dual 4-way 2×2, dual L without `road-end`, 1-cell T gap stitch, 3×3 roundabout on a local plus not on a dual 4-way), no mid-run `road-intersection` on a 2-cell avenue, sidewalk rings and frontage still hold. Manual QA: overlay of a generated avenue without the white median staircase, real crossings connected (no grass gap or internal `road-end`), local 4-ways can take Kenney roundabouts when the control is high.

## Exclusions and stop

No object editor, road editing, vehicles, `road-straight-half`, tapers 2→1, carriageways wider than two cells, or edits under `/assets`. Request review and stop before M3.6.2 / M4.
