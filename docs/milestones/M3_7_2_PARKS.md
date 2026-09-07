# M3.7.2 — Parks (structured interiors)

## IDs and inputs

**Milestone:** M3.7.2. **Requirements:** GEN-009/010/011 (amended), GEN-026 (amended), GEN-032, SIM-002 (amended), AST-016, FUN-046, DAT-002 (worker stage), TST-001–003, TST-006, TST-008, TST-011, ADR-0017. Read the [M3.7 program](M3_7_ZONE_DETAIL.md), [Generator](../GENERATOR_SPEC.md), [Simulation](../SIMULATION_SPEC.md), [Asset catalog](../ASSET_CATALOG.md), [Data model](../DATA_MODEL.md), [Functional](../FUNCTIONAL_SPEC.md), [Testing](../TESTING.md), and [ADR-0017](../adr/0017-park-interior-occupancy.md). Inputs are generator `0.7.0` cities (loadable without silent regeneration), Kenney Nature Kit 2.1 under `assets/kenney_nature-kit/` (untouched), and existing suburban path/planter meshes. Branch: `milestone/m3-7-2-parks`. This milestone does not start M3.7.3 or M4.

## Outputs

- Generator `0.8.0` runs a deterministic `parkInterior` stage after curb furniture. Habitable park manzanas compose a civic plaza (one statue, walkable suburban path strips, planters, edge trees). Pocket remnants compose a small grove (tree plus flowers; no monument or path).
- GEN-009 still consumes the placement RNG on park lots and pocket blocks but no longer `tryPlace`s scatter trees, so later lots do not re-roll. GEN-010 leftover decoration skips `zone === "park"` cells so leftover fill does not occupy the courtyard before composition.
- Road, traffic, and building RNG stay keyed with `0.6.7`. Curb furniture stays on the `0.7.0` `streetFurniture` stream. Only `parkInterior` uses `0.8.0`.
- Catalog pack `nature` allowlists 41 Kenney Nature Kit GLBs (trees, bushes, flowers, grass, statues, pots, sign). City-kit count stays 213. Suburban `path-short` / `path-stones-short` / `path-stones-messy` / `planter` gain park zone compatibility via overrides. Original files under `/assets` stay untouched.
- Park paths and garnish share occupancy cells and are not pedestrian obstacles (ADR-0017). Trees, large bushes, statues, planters, and large pots occupy uniquely and remain obstacles. Pedestrian and vehicle algorithms are unchanged; the network reconstructs around the new footprints.

## Verification and stop

Run `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:batch`. TST-011 covers plaza vs pocket motifs, leftover isolation, shared-cell garnish, occupant obstacles, habitable-park reachability, and determinism. Golden hashes use generator `0.8.0`. Old `0.7.0` documents remain loadable without silent regeneration.

Manual QA (owner): new Balanced 96×96, seed `green-crossroads`. Habitable parks show a statue and crossing path strips; pocket remnants show a grove without a monument; pedestrians walk the paths and go around statues; vehicles ignore park props.

No fountains, camping, crops, palms, `_fall` variants, road/lot/zone edits, NPC sit-points, or M4. Stop for review before M3.7.3.

## Evidence

Implementation is on `milestone/m3-7-2-parks`. Attach `pnpm check` / `typecheck` / `test` / `build`, TST-011 plus updated TST-001/006 goldens, and owner visual notes to the review PR. `pnpm test:batch` still fails two **pre-existing 0.7.0** road cases (`balanced-11` at 128: attempt 0–1 `TRAPPED_LANE`, attempt 2 avenue gap; GEN-023 `districtCount` 8: fat avenue on all attempts). Park interiors never run on those failing traffic attempts; do not change road/traffic algorithms in this milestone.
