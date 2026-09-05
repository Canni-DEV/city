# Testing strategy

## Automated suites

- **TST-001:** Unit tests prove same-input document hashes and deterministic retry derivation.
- **TST-002:** Generator batch tests run 50 seeds per preset distributed across all three sizes.
- **TST-003:** Invariant tests cover unique IDs/references, one connected road component, exact gate count, valid road combinations, footprints, boundaries, frontage, and zone quotas ±5 points.
- **TST-004:** Every editor command proves exact apply/revert, ID preservation, drag consolidation, redo clearing, and 100-entry history.
- **TST-005:** Persistence tests cover migrations, invalid input, size limit, future schema, ID collision, and snapshot round trips.
- **TST-006:** Catalog tests require exactly 213 unique valid entries, existing runtime sources, positive footprints, and road connectors.
- **TST-007:** Renderer integration tests prove forced fallback keeps the open document.

CI runs frozen install, Biome check, TypeScript typecheck, Vitest, and production build on pushes and pull requests. There is no numeric coverage gate, Playwright suite, or automated Markdown/link validation.

M1 evidence includes 200 generated documents: 50 seeds for each preset, with sizes distributed across 64, 96, and 128. The batch validates exact gate counts, references, a single connected road component, cardinal edge paths, one resolved tile per road cell, density/mask dimensions, and absence of internal dead ends. A fixed golden hash and forced retry test cover determinism and recovery.

M2 evidence reuses that 200-city batch and adds land invariants: unique block/lot IDs, complete free-cell coverage, rectangular non-overlapping lots with full road frontage, district/block references, and zone area shares within ±5 percentage points of normalized targets. Golden hashes include blocks and lots.

M3 evidence extends the same 200-city batch with placement invariants: every procedural entity references a catalog asset, stays inside the valid mask, and occupies unique spatial-hash cells. Golden hashes include entities and district themes. Renderer unit tests prove a single WebGPU→WebGL 2 fallback keeps the open `CityDocumentV1` identity, and quality/LOD swaps do not mutate the document.

## Manual QA per milestone

Test current Chrome and Edge, WebGPU and forced WebGL 2, 1280×720 and 1920×1080, keyboard/focus/contrast/patterns, and capture implemented flows. From M3 onward record the rendering and generation budgets in `RENDERING_AND_PERFORMANCE.md`.
