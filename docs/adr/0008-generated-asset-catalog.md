# ADR-008: Generated asset catalog with overrides

**Status:** Accepted — 2026-09-04

## Decision

Parse all 213 GLBs for automatic metadata, apply filename heuristics, and merge reviewed exceptions from one override file. Commit the deterministic generated JSON.

## Consequences

Coverage is complete without manually transcribing every model. Exceptions remain reviewable and build validation prevents stale paths, duplicate IDs, bad footprints, and incomplete connectors.
