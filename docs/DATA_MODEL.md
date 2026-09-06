# Data model

- **DAT-001:** `CityDocumentV1` is a complete schema-versioned snapshot with ID, name, UTC timestamps, generator version, seed, deterministic attempt, preset parameters (map size 64/96/128/256, density `low`/`medium`/`high`/`very-high`), one-unit cells, irregular boundary mask, and normalized per-cell density field.
- **DAT-002:** It contains districts, road graph nodes/edges/resolved cells, optional resolved road topology, sidewalks, blocks, lots, zones, and an entity registry. Resolved road cells are renderable tiles; occupied ground cells are the tile origin plus the catalog footprint (so a 2×2 curve occupies four unit cells and a 3×3 roundabout occupies nine). Arterial and collector carriageways occupy two adjacent unit cells (GEN-028); local streets occupy one. Graph nodes may be gates, district centers, or junctions. Edges record `arterial`, `collector`, or `local` class. Resolved cells may record the same class so lane-mates reconstruct without treating a mixed edge as all-avenue. Generator `0.6.7` cities also store `roadGraph.topology` (DAT-010).
- **DAT-003:** Every entity records asset ID, transform, footprint, origin (`procedural` or `user`), edit state, optional district/block/lot/zone, and compatibility warning.
- **DAT-004:** Each block has enough identity and regeneration index to reproduce replacement generation.
- **DAT-005:** Procedural IDs derive from generator version, seed, stage, and stable index. Manual IDs use `crypto.randomUUID()` and a `user:` prefix.
- **DAT-006:** Stored timestamps are ISO-8601 UTC. Name max is 80 characters; seed max is 64.
- **DAT-007:** JSON Schema is generated from the Zod source contract and committed for non-TypeScript consumers.
- **DAT-008:** Runtime agents and vehicles are not document fields. Agents are derived from seed plus the sidewalk/crossing graph; vehicles from seed plus reconstructed `DriveNetwork` geometry. Counts default from map size and quality and may be overridden in the city panel (0–64) without persistence. Neither appears in `CityEntity` collections or exports. Diagnostic overlay selection is also runtime-only.
- **DAT-009:** `sidewalks` is a document collection of renderable 1×1 pavement cells (`id`, `blockId`, `position`, `assetId`, `rotation`), sister to `roadGraph.cells`, not mixed into building entities. Sidewalk IDs are procedural (DAT-005). The structural hash includes this collection.

## Referential invariants

Road edges reference existing nodes; road cells, sidewalks, and entities reference existing catalog assets; `roadGraph.topology` tile IDs, when present, reference resolved road cells; sidewalks and lots reference blocks; blocks reference districts; optional entity ownership references exist when present. IDs are unique within their collection. Boundary mask and density field lengths equal `size²`; density is zero outside the mask and remains between zero and one.

## Worker messages

Requests are `generate` and `cancel`. Responses are `progress`, `complete`, `cancelled`, and `error`. Every message carries `requestId`; progress additionally carries a named stage, 0–100 percent, and human-readable status. The UI ignores stale responses. M3 stages are `placement` and `decoration` after the M2 land stages and before `validation`. M3.6.1 inserts `sidewalks` between `blocks` and `lots`. M3.6.2 inserts `traffic` between `tiles` and `blocks`.

- **DAT-010 (M3.6.2):** `roadGraph.topology` contains versioned sections (`street`, `junction`, `curve`, `roundabout`, `terminal`), tile ID references, directional ports, lane pairs, required movements, and portals with deterministic IDs. It is required for generated `0.6.7` cities and included in structural hashes via `roadGraph`; empty documents may omit it. Curves, arc-length tables, geometry indexes, crossing associations, vehicles, caches, and inspector selection remain derived. There is no inferred `(cell, heading)` fallback and no migration that synthesizes topology for older generators.
