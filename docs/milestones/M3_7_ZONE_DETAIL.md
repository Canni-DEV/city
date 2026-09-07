# M3.7 — Zone detail (program)

## IDs and approved inputs

**Milestone family:** M3.7. **Program requirements:** GEN-010/011 (amended), GEN-030+, AST-015, FUN-045, TST-010, ADR-0016. Read [Generator](../GENERATOR_SPEC.md), [Asset catalog](../ASSET_CATALOG.md), [Data model](../DATA_MODEL.md), [Simulation](../SIMULATION_SPEC.md), and [Testing](../TESTING.md). Branch for the first sub-phase: `milestone/m3-7-1-streets`. This program does not start M4.

M3.7 improves procedural placement **by zone**: asset use, consistency, normalization, and characteristic detail. Generated rendering objects remain reconstructible from `CityDocumentV1`. Original files under `/assets` stay untouched. Each sub-phase has its own brief, generator increment when hashes change, and review gate. Do not start the next sub-phase until the current one is reviewed.

## Sub-phases

- **M3.7.1 Calles** (this delivery): deterministic curb furniture — traffic lights, stop and street signs, highway signs at gates, street lights, utility poles, sparse dumpsters. See [M3.7.1](M3_7_1_STREETS.md).
- **M3.7.2 Parques** (stub): denser and more structured park interiors — trees, monuments or decorations, paths, fountains. Add catalog assets only if the existing Kenney set cannot express the brief.
- **M3.7.3 Manzanas urbanas** (stub): lot facing toward the sidewalk, courtyard and block-core trees or pocket greens, trash cans and typical yard detail (suburban and urban together).
- **M3.7.4 Industrial** (stub): composed industrial lots so props read as yards and plants, not random scatter.
- **M3.7.5 Comercial** (stub): storefront awnings, signs, and frontage detail. Not implemented in this delivery.

## Shared invariants

- Determinism for the same generator version, seed, attempt, and parameters (GEN-025 / ADR-005).
- Roads remain one connected component and are not editable in v1.
- Procedural entities stay in the valid mask; buildings still do not overlap occupancy cells.
- Runtime pedestrians and vehicles stay reconstructible and outside the document.
- No elevated roads, road editing, zoning editing, new Kenney packs unless a later brief requires them, telemetry, or M4 editor work.

## Stop

Complete only the current sub-phase brief. After M3.7.1 review, write the M3.7.2 brief before implementing parks.
