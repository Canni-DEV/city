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
3. **GEN-003:** Build Delaunay candidates, a connecting arterial tree plus extra cycles, then a local street mesh whose orthogonality follows regularity (0 = warped/organic manzanas, 100 = orthogonal grid).
4. **GEN-004:** Route arterial/collector edges on the unit grid with long cardinal runs and 90° elbows, then rasterize local 1-cell streets that close blocks.
5. **GEN-005:** Resolve straight, curve, cross, T, end, and roundabout modular tiles from neighbor topology, road class, and catalog connectors. Arterial/collector elbows may use 2×2 curve assets; arterial 4-ways may use the 3×3 Kenney roundabout when the footprint fits with four approach cells; local streets use 1×1 bends.
6. **GEN-006:** Flood-fill free regions into street-bounded blocks (manzanas). Do not slice regions into 4×4 zoning patches.
7. **GEN-007:** Subdivide a rectangular frontage ring (depth 3–4) inside each block; leftover interior cells remain a courtyard.
8. **GEN-008:** Assign zones from centrality, access, periphery, block size, and normalized quotas.
9. **GEN-009:** Place compatible catalog assets using footprints and a spatial hash.
10. **GEN-010:** Add decoration and district themes.
11. **GEN-011:** Validate connectivity, overlaps, quotas, references, gates, and road combinations.

M1 implements GEN-001–005 using generator version `0.2.0`. Delaunay edges express organic straight-line intent; deterministic cardinal A* rasterizes that intent onto the v1 ground-level Kenney road set. Consequently, diagonal intent is represented by alternating cardinal segments and curves rather than unsupported 45-degree asset rotations.

M2 implements GEN-006–008 using generator version `0.3.0`. Connected free cells are flood-filled, then bounded into compact patches so five-zone area quotas stay achievable. Rectangular lots occupy only road-fronted parcels inside those blocks; leftover interior cells remain in the block without becoming lots. Zone assignment scores centrality, road access, periphery, and block size, then fills remaining normalized area quotas.

M3 implements GEN-009–011 using generator version `0.4.0`. Compatible catalog buildings occupy road-fronted lots via footprint cell spans and a spatial hash. Parks receive trees; leftover valid cells receive decoration scaled by the decoration control. District palettes come from the selected color theme (`colormap`, `variation-a`, `variation-b`). Validation then requires complete catalog references, unique entity IDs, in-mask occupancy, and no overlapping procedural cells.

M3.5 implements revised GEN-003–007 using generator version `0.5.0`. Arterials still connect gates and districts; a local mesh then closes manzanas of about 8–12 free cells (6–8 on 64×64 maps). Tile yaw is chosen so rotated catalog connectors match occupied neighbors. Kenney 1×1 bends and 2×2 curves open west+south at yaw 0. Multi-cell road assets occupy their catalog footprints. Blocks are the street-bounded leftover components; lots form a ring facing every adjacent street. M3 placement runs unchanged on the new lots.

## Invariants and recovery

- **GEN-020:** All roads form one connected component of occupied cells (catalog footprints included). External gates count is 2, 3, and 4 for sizes 64, 96, and 128.
- **GEN-021:** Dead ends occur only in suburban zones. Elevated assets remain cataloged but unavailable. The morphology generator prunes internal degree-1 cells so surviving stubs are gates.
- **GEN-022:** Every buildable lot has frontage on occupied road cells; procedural buildings neither overlap nor leave valid cells.
- **GEN-023:** Actual zone area stays within ±5 percentage points of normalized targets.
- **GEN-024:** Failed validation retries at most twice after the initial attempt, deriving each attempt deterministically.
- **GEN-025:** Same version, input, and attempt produce byte-equivalent canonical content and hash.

The structural hash excludes library identity, display name, and timestamps. It covers generator inputs plus the generated map, districts, graph, resolved road cells, blocks, lots, and entities, making it suitable for golden determinism tests.
