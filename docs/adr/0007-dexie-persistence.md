# ADR-007: Local persistence with Dexie

**Status:** Accepted — 2026-09-04

## Decision

Use Dexie over IndexedDB for a multi-city local library, snapshots, metadata, and thumbnails. Autosave is debounced one second and migrations are explicit.

## Consequences

City works without a backend or account. Quota and private-mode failures require export/retry recovery; undo history is deliberately not stored.
