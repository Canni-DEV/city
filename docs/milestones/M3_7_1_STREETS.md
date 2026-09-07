# M3.7.1 — Streets (curb furniture)

## IDs and inputs

**Milestone:** M3.7.1. **Requirements:** GEN-010 (amended), GEN-011 (amended), GEN-030–031, SIM-002 (amended), AST-015, FUN-045, DAT-002 (worker stage), TST-001–003, TST-008, TST-010, ADR-0016. Read the [M3.7 program](M3_7_ZONE_DETAIL.md), [Generator](../GENERATOR_SPEC.md), [Simulation](../SIMULATION_SPEC.md), [Asset catalog](../ASSET_CATALOG.md), [Data model](../DATA_MODEL.md), [Functional](../FUNCTIONAL_SPEC.md), [Testing](../TESTING.md), and [ADR-0016](../adr/0016-curb-street-furniture.md). Inputs are generator `0.6.7` cities (loadable without silent regeneration), Kenney city-kit roads furniture already in the 213-entry catalog, sidewalk rings, and persisted `RoadTopology`. Branch: `milestone/m3-7-1-streets`. This milestone does not start M3.7.2 or M4.

## Outputs

- Generator `0.7.0` runs a deterministic `streetFurniture` stage after leftover decoration. Street-control devices, street-name posts, highway signs at gates, mid-block lights, avenue utility poles, and sparse dumpsters become `CityEntity` records with sub-cell transforms on sidewalks.
- GEN-010 leftover fill no longer picks `street-furniture` or road-pack signs/lights, so stop signs and traffic lights do not appear at random in lots.
- Intersection policy GEN-031: visual-only `roads:traffic-light` on arterial/collector T and 4-way approaches; STOP only on local approaches into an avenue; no stop or light on local-only T/4-way, roundabouts, or external gates. One `roads:road-sign-street` per T/4-way, on the north-east sidewalk corner. Street-lamp arms face the carriageway.
- Curb furniture shares the sidewalk cell (ADR-0016). Curb-class props (max footprint axis &lt; 0.25) are not pedestrian obstacles. Dumpsters and construction remain obstacles and sit against the lot wall so a ≥ 0.30 walking corridor remains. Vehicles ignore lights (no SIM signal cycle).
- Catalog overrides set reviewed `front` for signs and the pole traffic light (AST-015). City-kit count stays 213. No `/assets` edits. No hanging/object/wire meshes as standalone props.

## Verification and stop

Run `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:batch`. TST-010 covers junction policy, one street sign per qualifying corner, highway signs at gates, and pedestrian-graph connectivity with curb furniture present. Golden hashes use generator `0.7.0`. Old `0.6.7` documents remain loadable without silent regeneration.

Manual QA (owner): new Balanced 96×96, seed `green-crossroads`. Avenue T/4-way shows pole lights; STOP only before entering an avenue; one street-name post on the north-east corner of each T/4-way; lamp arms over the carriageway; gates have a highway sign; lights sit mid-block, not stacked on control devices; pedestrians still pass; vehicles do not stop for lights.

No traffic-light cycle, generated street names, extra asset packs, road editing, parks/block/industrial/commercial sub-phases, or M4. Stop for review before M3.7.2.

## Evidence

Implementation is on `milestone/m3-7-1-streets`. Attach the five pnpm commands, TST-010 plus updated TST-001/002/003 goldens, and owner visual notes to the review PR.
