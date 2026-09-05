# Data model

- **DAT-001:** `CityDocumentV1` is a complete schema-versioned snapshot with ID, name, UTC timestamps, generator version, seed, deterministic attempt, preset parameters, map size, one-unit cells, irregular boundary mask, and normalized per-cell density field.
- **DAT-002:** It contains districts, road graph nodes/edges/resolved cells, sidewalks, blocks, lots, zones, and an entity registry. Resolved road cells are renderable tiles; occupied ground cells are the tile origin plus the catalog footprint (so a 2×2 curve occupies four unit cells and a 3×3 roundabout occupies nine). Arterial and collector carriageways occupy two adjacent unit cells (GEN-028); local streets occupy one. Graph nodes may be gates, district centers, or junctions. Edges record `arterial`, `collector`, or `local` class. Resolved cells may record the same class so lane-mates reconstruct without treating a mixed edge as all-avenue.
- **DAT-003:** Every entity records asset ID, transform, footprint, origin (`procedural` or `user`), edit state, optional district/block/lot/zone, and compatibility warning.
- **DAT-004:** Each block has enough identity and regeneration index to reproduce replacement generation.
- **DAT-005:** Procedural IDs derive from generator version, seed, stage, and stable index. Manual IDs use `crypto.randomUUID()` and a `user:` prefix.
- **DAT-006:** Stored timestamps are ISO-8601 UTC. Name max is 80 characters; seed max is 64.
- **DAT-007:** JSON Schema is generated from the Zod source contract and committed for non-TypeScript consumers.
- **DAT-008:** Runtime agents are not document fields. They are derived from seed plus the sidewalk/crossing graph and must not appear in `CityEntity` collections or exports.
- **DAT-009:** `sidewalks` is a document collection of renderable 1×1 pavement cells (`id`, `blockId`, `position`, `assetId`, `rotation`), sister to `roadGraph.cells`, not mixed into building entities. Sidewalk IDs are procedural (DAT-005). The structural hash includes this collection.

## Referential invariants

Road edges reference existing nodes; road cells, sidewalks, and entities reference existing catalog assets; sidewalks and lots reference blocks; blocks reference districts; optional entity ownership references exist when present. IDs are unique within their collection. Boundary mask and density field lengths equal `size²`; density is zero outside the mask and remains between zero and one.

## Worker messages

Requests are `generate` and `cancel`. Responses are `progress`, `complete`, `cancelled`, and `error`. Every message carries `requestId`; progress additionally carries a named stage, 0–100 percent, and human-readable status. The UI ignores stale responses. M3 stages are `placement` and `decoration` after the M2 land stages and before `validation`. M3.6.1 inserts `sidewalks` between `blocks` and `lots`.
