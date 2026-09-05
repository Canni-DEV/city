# Generator specification

## Presets

Values are suburban/urban/commercial/industrial/park, then density, districts, regularity, roundabouts, and decoration.

| Preset | Mix | Density | Districts | Regularity | Roundabouts | Decoration |
|---|---|---:|---:|---:|---:|---:|
| Balanced | 35/25/15/15/10 | Medium | 4 | 55 | 25 | 60 |
| Suburban | 60/15/10/5/10 | Low | 3 | 40 | 35 | 80 |
| Commercial Core | 20/30/30/10/10 | High | 4 | 70 | 20 | 70 |
| Industrial City | 20/15/10/45/10 | Medium | 3 | 65 | 10 | 45 |

## Pipeline

1. **GEN-001:** Create the irregular urban mask and density fields.
2. **GEN-002:** Place 2–8 polycentric district centers with deterministic minimum distance.
3. **GEN-003:** Build Delaunay candidates, a connecting tree, and parameterized extra cycles.
4. **GEN-004:** Route edges with deterministic A* on the unit grid.
5. **GEN-005:** Resolve straight, diagonal, curve, cross, T, end, and roundabout modular tiles.
6. **GEN-006:** Flood-fill free regions into blocks.
7. **GEN-007:** Subdivide rectangular lots with road frontage.
8. **GEN-008:** Assign zones from centrality, access, periphery, block size, and normalized quotas.
9. **GEN-009:** Place compatible catalog assets using footprints and a spatial hash.
10. **GEN-010:** Add decoration and district themes.
11. **GEN-011:** Validate connectivity, overlaps, quotas, references, gates, and road combinations.

M1 implements GEN-001–005 using generator version `0.2.0`. Delaunay edges express organic straight-line intent; deterministic cardinal A* rasterizes that intent onto the v1 ground-level Kenney road set. Consequently, diagonal intent is represented by alternating cardinal segments and curves rather than unsupported 45-degree asset rotations.

## Invariants and recovery

- **GEN-020:** All roads form one connected component. External gates count is 2, 3, and 4 for sizes 64, 96, and 128.
- **GEN-021:** Dead ends occur only in suburban zones. Elevated assets remain cataloged but unavailable.
- **GEN-022:** Every buildable lot has frontage; procedural buildings neither overlap nor leave valid cells.
- **GEN-023:** Actual zone area stays within ±5 percentage points of normalized targets.
- **GEN-024:** Failed validation retries at most twice after the initial attempt, deriving each attempt deterministically.
- **GEN-025:** Same version, input, and attempt produce byte-equivalent canonical content and hash.

The M1 structural hash excludes library identity, display name, and timestamps. It covers generator inputs plus the generated map, districts, graph, and resolved road cells, making it suitable for golden determinism tests.
