# ADR-003: CityDocument is the source of truth

**Status:** Accepted — 2026-09-04

## Decision

Persist and mutate one complete, versioned `CityDocument`. Treat scene nodes, instance maps, spatial indexes, thumbnails, and UI projections as disposable derived data.

## Consequences

Save/export and fallback behavior remain predictable. Derived structures must rebuild efficiently and may never introduce hidden authoritative state.
