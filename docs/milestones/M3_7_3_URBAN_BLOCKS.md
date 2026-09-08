# M3.7.3 — Urban blocks (yards and courtyards)

## IDs and inputs

**Milestone:** M3.7.3. **Requirements:** GEN-009/010/011 (amended), GEN-033, FUN-047, DAT-002 (worker stage), TST-001–003, TST-008, TST-012, ADR-0018. Read the [M3.7 program](M3_7_ZONE_DETAIL.md), [Generator](../GENERATOR_SPEC.md), [Functional](../FUNCTIONAL_SPEC.md), [Data model](../DATA_MODEL.md), [Testing](../TESTING.md), and [ADR-0018](../adr/0018-block-yard-occupancy.md). Inputs are generator `0.8.1` cities (loadable without silent regeneration), Kenney suburban kit trees/planters/paths/`fence-low`, and `roads:dumpster` already in the 213-entry catalog. Branch: `milestone/m3-7-3-urban-blocks`. This milestone does not start M3.7.4, M3.7.5, or M4.

## Outputs

- Generator `0.9.0` runs a deterministic `blockYards` stage after park interiors. Suburban and urban manzanas keep buildings flush to the sidewalk with catalog `front` facing that sidewalk. Courtyard cells (block interior that is neither sidewalk nor lot) compose a pocket green when they have at most four cells, or a compact suburban grove when larger. Lot backyards receive a rear-corner dumpster (lots with a building), sparse `fence-low` on side/back edges, and leftover trees/planters/`path-short`.
- GEN-010 leftover decoration skips `suburban` and `urban` cells so scatter fill does not occupy yards before composition. Commercial and industrial leftover remains. Nature Kit stays park-only.
- Road, traffic, and building RNG stay keyed with `0.6.7`. Curb furniture stays on the `0.7.0` `streetFurniture` stream. Park interiors stay on the `0.8.1` `parkInterior` stream. Only `blockYards` uses `0.9.0`.
- Lot dumpsters occupy a unique hash cell (ADR-0018). Sidewalk dumpsters remain ADR-0016 shared occupancy on commercial/industrial curbs. All yard props occupy uniquely. Pedestrians still do not walk lots or courtyards.

## Verification and stop

Run `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:batch`. TST-012 covers sidewalk facing, courtyard motif by size, leftover isolation, lot dumpsters vs curb dumpsters, `fence-low` on side/back edges only, no Nature Kit or driveways in suburban/urban yards, unique occupancy, pedestrian connectivity, and determinism. Golden hashes use generator `0.9.0`. Old `0.8.1` documents remain loadable without silent regeneration.

Manual QA (owner): new Balanced 96×96, seed `green-crossroads`. Houses face the sidewalk; block cores show trees or a small planter green according to courtyard size; a dumpster sits behind occupied houses; pedestrians stay on sidewalks and parks.

No industrial yard composition, commercial awnings, walking lots/courtyards, NPC sit-points, extra asset packs, `/assets` edits, or M4. Stop for review before M3.7.4.

## Evidence

Implementation is on `milestone/m3-7-3-urban-blocks`. Attach `pnpm check` / `typecheck` / `test` / `build`, TST-012 plus updated TST-001 goldens, and owner visual notes to the review PR. `pnpm test:batch` still fails two **pre-existing 0.7.0** road cases (`balanced-11` at 128: avenue gap; GEN-023 `districtCount` 8: fat avenue). Yard composition never runs on those failing traffic attempts; do not change road/traffic algorithms in this milestone.
