# ADR-005: Versioned determinism

**Status:** Accepted — 2026-09-04

## Decision

All randomness comes from `pure-rand` streams derived from generator version, text seed, stage, and retry attempt. Algorithms use stable ordering and procedural IDs.

## Consequences

Equal inputs reproduce equal canonical hashes. Any intentional output change increments the generator version and updates golden fixtures; old snapshots remain loadable without silent regeneration.
