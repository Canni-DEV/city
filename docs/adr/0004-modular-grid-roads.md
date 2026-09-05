# ADR-004: Modular roads on a unit grid

**Status:** Accepted — 2026-09-04

## Decision

Route a connected graph deterministically over one-unit cells, then resolve modular straight, diagonal, curved, junction, end, and roundabout assets at ground level.

## Consequences

The Kenney road kit is reusable and validation is discrete. V1 excludes bridges, ramps, multilevel roads, and road editing.
