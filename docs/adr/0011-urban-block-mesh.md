# ADR-011: Hierarchical urban block mesh

**Status:** Accepted — 2026-09-05

## Decision

Generate a connected arterial/collector skeleton between gates and districts, then overlay a local one-cell street mesh whose spacing and orthogonality follow road regularity. Resolve modular Kenney tiles from catalog connectors; 2×2 curve assets occupy four unit cells and 3×3 roundabouts occupy nine, while remaining on the unit grid.

## Consequences

Closed manzanas become a generator invariant rather than a slider accident. ADR-004 still forbids road editing, bridges, ramps, and multilevel networks. Occupancy, lots, and rendering must expand multi-cell road footprints from catalog metadata. Intentional morphology changes increment the generator version.
