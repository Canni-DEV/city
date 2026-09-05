# Data model

- **DAT-001:** `CityDocumentV1` is a complete schema-versioned snapshot with ID, name, UTC timestamps, generator version, seed, deterministic attempt, preset parameters, map size, one-unit cells, irregular boundary mask, and normalized per-cell density field.
- **DAT-002:** It contains districts, road graph nodes/edges/resolved cells, blocks, lots, zones, and an entity registry.
- **DAT-003:** Every entity records asset ID, transform, footprint, origin (`procedural` or `user`), edit state, optional district/block/lot/zone, and compatibility warning.
- **DAT-004:** Each block has enough identity and regeneration index to reproduce replacement generation.
- **DAT-005:** Procedural IDs derive from generator version, seed, stage, and stable index. Manual IDs use `crypto.randomUUID()` and a `user:` prefix.
- **DAT-006:** Stored timestamps are ISO-8601 UTC. Name max is 80 characters; seed max is 64.
- **DAT-007:** JSON Schema is generated from the Zod source contract and committed for non-TypeScript consumers.

## Referential invariants

Road edges reference existing nodes; road cells and entities reference existing catalog assets; lots reference blocks; blocks reference districts; optional entity ownership references exist when present. IDs are unique within their collection. Boundary mask and density field lengths equal `size²`; density is zero outside the mask and remains between zero and one.

## Worker messages

Requests are `generate` and `cancel`. Responses are `progress`, `complete`, `cancelled`, and `error`. Every message carries `requestId`; progress additionally carries a named stage, 0–100 percent, and human-readable status. The UI ignores stale responses. M3 stages are `placement` and `decoration` after the M2 land stages and before `validation`.
