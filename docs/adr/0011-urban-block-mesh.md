# ADR-011: Hierarchical urban block mesh

**Status:** Accepted — 2026-09-05

## Decision

Generate a connected arterial/collector skeleton between gates and districts, dilate those corridors to a two-cell carriageway, then overlay a local one-cell street mesh whose spacing and orthogonality follow road regularity. Resolve modular Kenney tiles from catalog connectors against **logical** neighbors (the twin cell is not a street); 2×2 curve assets occupy four unit cells and 3×3 roundabouts occupy nine when a 1-cell-wide footprint still fits, while remaining on the unit grid.

**Amendment (M3.6.1 avenue junctions, 2026-09-05):** Dual L/T/4-way nudos are occupancy blocks, not leftover 1-cell gaps. A 1-cell-wide L may still use 2×2 `road-curve`; dual T/4-way cells with four openings use unit `road-crossroad`. Generator `0.6.5`.

**Amendment (M3.6.1 local roundabouts, 2026-09-05):** The 3×3 `road-roundabout` sits on 1-cell-wide 4-ways (local pluses; remnant 1-cell arterials still qualify). Dual-avenue 4-ways stay a 2×2 of unit tiles. Generator `0.6.6`.

## Consequences

Closed manzanas become a generator invariant rather than a slider accident. ADR-004 still forbids road editing, bridges, ramps, and multilevel networks. Occupancy, lots, and rendering must expand multi-cell road footprints from catalog metadata. Intentional morphology changes increment the generator version.
