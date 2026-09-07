# M3.7 — Zone detail (program)

## IDs and approved inputs

**Milestone family:** M3.7. **Program requirements:** GEN-010/011 (amended), GEN-030+, GEN-032, AST-015–016, FUN-045–046, TST-010–011, ADR-0016–0017. Read [Generator](../GENERATOR_SPEC.md), [Asset catalog](../ASSET_CATALOG.md), [Data model](../DATA_MODEL.md), [Simulation](../SIMULATION_SPEC.md), and [Testing](../TESTING.md). Branch for parks: `milestone/m3-7-2-parks`. This program does not start M4.

M3.7 improves procedural placement **by zone**: asset use, consistency, normalization, and characteristic detail. Generated rendering objects remain reconstructible from `CityDocumentV1`. Original files under `/assets` stay untouched. Each sub-phase has its own brief, generator increment when hashes change, and review gate. Do not start the next sub-phase until the current one is reviewed.

## Sub-phases

- **M3.7.1 Calles**: deterministic curb furniture — traffic lights, stop and street signs, highway signs at gates, street lights, utility poles, sparse dumpsters. See [M3.7.1](M3_7_1_STREETS.md).
- **M3.7.2 Parques** (this delivery): structured park interiors — civic plazas with a statue and walkable path strips; pocket groves of trees and flowers. Nature Kit allowlist plus suburban paths/planters. See [M3.7.2](M3_7_2_PARKS.md).
- **M3.7.3 Manzanas urbanas** (stub): lot facing toward the sidewalk, courtyard and block-core trees or pocket greens, trash cans and typical yard detail (suburban and urban together).
- **M3.7.4 Industrial** (stub): composed industrial lots so props read as yards and plants, not random scatter.
- **M3.7.5 Comercial** (stub): storefront awnings, signs, and frontage detail. Not implemented in this delivery.

## Shared invariants

- Determinism for the same generator version, seed, attempt, and parameters (GEN-025 / ADR-005).
- Roads remain one connected component and are not editable in v1.
- Procedural entities stay in the valid mask; buildings still do not overlap occupancy cells.
- Runtime pedestrians and vehicles stay reconstructible and outside the document.
- No elevated roads, road editing, zoning editing, telemetry, or M4 editor work. M3.7.2 catalogs a curated Nature Kit allowlist (AST-016); later sub-phases must not add packs unless their brief requires them.

## Stop

Complete only the current sub-phase brief. After M3.7.2 review, write the M3.7.3 brief before implementing urban blocks.
