# Testing strategy

## Automated suites

- **TST-001:** Unit tests prove same-input document hashes and deterministic retry derivation.
- **TST-002:** Generator batch tests run 50 seeds per preset distributed across all three sizes.
- **TST-003:** Invariant tests cover unique IDs/references, one connected road component of occupied cells, one connected sidewalk-plus-crossing pedestrian graph, exact gate count, catalog-connector tile combinations, footprints, boundaries, sidewalk rings, frontage on sidewalk, street-bounded blocks, and zone quotas ±5 points.
- **TST-004:** Every editor command proves exact apply/revert, ID preservation, drag consolidation, redo clearing, and 100-entry history.
- **TST-005:** Persistence tests cover migrations, invalid input, size limit, future schema, ID collision, and snapshot round trips.
- **TST-006:** Catalog tests require exactly 213 unique valid city-kit GLB entries, existing runtime sources, positive footprints, and complete road connectors. M3.6 implementation extends this suite to generated protagonist GLBs and skins without packing source FBX.
- **TST-007:** Renderer integration tests prove forced fallback keeps the open document.
- **TST-008:** Agent tests prove walk-graph construction from sidewalks and crossings, A*, two-lane reservation with wait-then-repath, seeded spawn on sidewalks, idle/run clip selection, and that agent ticks do not mutate `CityDocumentV1`.

CI runs frozen install, Biome check, TypeScript typecheck, Vitest, and production build on pushes and pull requests. There is no numeric coverage gate, Playwright suite, or automated Markdown/link validation.

M1 evidence includes 200 generated documents: 50 seeds for each preset, with sizes distributed across 64, 96, and 128. The batch validates exact gate counts, references, a single connected road component, cardinal edge paths, one resolved tile per road cell, density/mask dimensions, and absence of internal dead ends. A fixed golden hash and forced retry test cover determinism and recovery.

M2 evidence reuses that 200-city batch and adds land invariants: unique block/lot IDs, complete free-cell coverage, rectangular non-overlapping lots with full road frontage, district/block references, and zone area shares within ±5 percentage points of normalized targets. Golden hashes include blocks and lots.

M3 evidence extends the same 200-city batch with placement invariants: every procedural entity references a catalog asset, stays inside the valid mask, and occupies unique spatial-hash cells. Golden hashes include entities and district themes. Renderer unit tests prove a single WebGPU→WebGL 2 fallback keeps the open `CityDocumentV1` identity, and quality/LOD swaps do not mutate the document.

M3.5 evidence regenerates that 200-city batch under generator `0.5.0`: occupied road cells form one 4-connected component, resolved tiles match rotated catalog connectors, typical enclosed blocks on 96/128 maps have multi-side frontage and manzana-scale bounds, lots keep full road frontage, and zone shares stay within ±5 points. Connector yaw unit tests cover `road-bend` and `road-curve`.

M3.6 evidence is independent of document hashes: seeded agent spawn, A*, reservation/wait/repath, and unchanged `CityDocumentV1` identity after ticks (TST-008). Catalog tests also reject Kenney `0.Targeting Pose` clips in exported idle/run/jump GLBs (TST-006).

M3.6.1 evidence regenerates the 200-city batch under generator `0.6.3`: habitable sidewalk rings occupy the 1-cell road-adjacent perimeter of each block that still has an interior, remnants too thin for a ring are pocket parks, lots do not overlap sidewalks and keep sidewalk frontage, local T/4-way tiles are Kenney `*-path` while avenue T/4-way tiles are unsuffixed `road-intersection` / `road-crossroad`, the pedestrian graph is one 4-connected component, and two agents may share a sidewalk cell on distinct lanes.

The M3.6.1 avenue hotfix regenerates that batch under generator `0.6.6`: arterial/collector corridors occupy two cells, parallel 1-cell axes collapse into that pair instead of a 3-cell through-slab, dual corridors one cell apart stitch into L/T/4-way blocks, dual through-runs resolve to `road-straight` (not mid-run `road-intersection`), dual T/4-way 2×2 cells with four openings use `road-crossroad`, 1-cell-wide local 4-ways may take `road-roundabout`, tile connectors match logical neighbors, sidewalk rings and frontage still hold, and old `0.6.5` snapshots remain loadable without silent regeneration.

## Manual QA per milestone

Test current Chrome and Edge, WebGPU and forced WebGL 2, 1280×720 and 1920×1080, keyboard/focus/contrast/patterns, and capture implemented flows. From M3 onward record the rendering and generation budgets in `RENDERING_AND_PERFORMANCE.md`.
