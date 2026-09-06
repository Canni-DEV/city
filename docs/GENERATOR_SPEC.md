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
4. **GEN-004:** Route arterial/collector edges on the unit grid with long cardinal runs and 90° elbows, dilate those corridors to a 2-cell carriageway, then rasterize local 1-cell streets that close blocks.
5. **GEN-005:** Resolve straight, curve, cross, T, end, and roundabout modular tiles from **logical** neighbor topology (GEN-028), road class, and catalog connectors. Arterial/collector elbows may use 2×2 curve assets when a 1-cell-wide footprint still fits. The 3×3 Kenney roundabout sits on a 1-cell-wide 4-way (local streets, and remnant 1-cell arterials) when four approach cells and empty corners fit; dual-avenue 4-ways do not take it. Dual-axis L/T/4-way nudos are designed 2×2 blocks: a 1-cell L may still take `road-curve`; a dual L uses unit `road-bend-sidewalk` (or unit tiles from physical connectors); dual T/4-way use `road-crossroad` 1×1 on cells with four openings. Local streets use 1×1 bends otherwise.
6. **GEN-006:** Flood-fill free regions into street-bounded blocks (manzanas). Do not slice regions into 4×4 zoning patches.
7. **GEN-007:** Subdivide a rectangular frontage ring (depth 3–4) inside each block **inward of the sidewalk**; leftover interior cells remain a courtyard.
8. **GEN-008:** Assign zones from centrality, access, periphery, block size, and normalized quotas.
9. **GEN-009:** Place compatible catalog assets using footprints and a spatial hash.
10. **GEN-010:** Add decoration and district themes.
11. **GEN-011:** Validate connectivity, overlaps, quotas, references, gates, and road combinations.

M1 implements GEN-001–005 using generator version `0.2.0`. Delaunay edges express organic straight-line intent; deterministic cardinal A* rasterizes that intent onto the v1 ground-level Kenney road set. Consequently, diagonal intent is represented by alternating cardinal segments and curves rather than unsupported 45-degree asset rotations.

M2 implements GEN-006–008 using generator version `0.3.0`. Connected free cells are flood-filled, then bounded into compact patches so five-zone area quotas stay achievable. Rectangular lots occupy only road-fronted parcels inside those blocks; leftover interior cells remain in the block without becoming lots. Zone assignment scores centrality, road access, periphery, and block size, then fills remaining normalized area quotas.

M3 implements GEN-009–011 using generator version `0.4.0`. Compatible catalog buildings occupy road-fronted lots via footprint cell spans and a spatial hash. Parks receive trees; leftover valid cells receive decoration scaled by the decoration control. District palettes come from the selected color theme (`colormap`, `variation-a`, `variation-b`). Validation then requires complete catalog references, unique entity IDs, in-mask occupancy, and no overlapping procedural cells.

M3.5 implements revised GEN-003–007 using generator version `0.5.0`. Arterials still connect gates and districts; a local mesh then closes manzanas of about 8–12 free cells (6–8 on 64×64 maps). Tile yaw is chosen so rotated catalog connectors match occupied neighbors. Kenney 1×1 bends and 2×2 curves open west+south at yaw 0. Multi-cell road assets occupy their catalog footprints. Blocks are the street-bounded leftover components; lots form a ring facing every adjacent street. M3 placement runs unchanged on the new lots.

M3.6.1 implements GEN-026–027 using generator version `0.6.3`. After GEN-006, a 1-cell sidewalk ring occupies every habitable block cell 4-adjacent to roads (park manzanas with an interior included). Blocks that the ring would empty become pocket parks without `tile-low`. Lots pack only non-sidewalk block cells and front that ring. Local T and 4-way tiles resolve to Kenney `*-path`; arterial and collector T/4-way tiles resolve to unsuffixed `road-intersection` / `road-crossroad` so connectors match topology. Placement occupancy includes sidewalk cells. Local mesh axes stay at least 4 cells apart so a ring still leaves an interior.

The M3.6.1 avenue hotfix implements GEN-028 using generator version `0.6.6`. Arterial and collector corridors occupy two adjacent cells; parallel 1-cell axes that already touch become that pair instead of a 3-cell slab. Dual corridors that sit one cell apart stitch into an L, T, or 4-way block. The 3×3 Kenney roundabout sits on 1-cell-wide 4-ways (local streets and remnant arterials), not on dual-avenue nudos. Tile connectors match logical neighbors (lane-mate is not a street on a through-run; at a dual elbow the mate is the other leg of the turn). Old `0.6.5` documents remain loadable without silent regeneration.

M3.6.2 implements GEN-029 using generator version `0.6.7`. After GEN-005 tile resolution, local opening and avenue-transition repairs run, then directed topology is resolved and validated against measured carriageways and catalog body clearance **before** GEN-006. The worker reports this as the `traffic` stage. Old `0.6.6` documents remain loadable without silent regeneration; they have no topology and are not vehicle-enabled.

## Invariants and recovery

- **GEN-020:** All roads form one connected component of occupied cells (catalog footprints included). External gates count is 2, 3, and 4 for sizes 64, 96, and 128.
- **GEN-021:** Dead ends occur only in suburban zones. Elevated assets remain cataloged but unavailable. The morphology generator prunes internal degree-1 cells so surviving stubs are gates.
- **GEN-022:** Every buildable lot has frontage on sidewalk cells that are 4-adjacent to occupied road cells; procedural buildings neither overlap nor leave valid cells.
- **GEN-023:** Actual zone area stays within ±5 percentage points of normalized targets. Pocket-park remnant area is excluded from that comparison.
- **GEN-024:** Failed validation retries at most twice after the initial attempt, deriving each attempt deterministically.
- **GEN-025:** Same version, input, and attempt produce byte-equivalent canonical content and hash.
- **GEN-026:** Sidewalk cells are the 1-cell perimeter of each **habitable** block that touches occupied road; they remain in `block.cells`, are persisted in `sidewalks`, and are excluded from lot packing. A block whose every cell would be consumed by that ring is a pocket park: no sidewalks, no lots, park zone, trees on the remnant cells. GEN-023 quotas ignore pocket-park area.
- **GEN-027:** Local unit T and 4-way tiles use Kenney path meshes (`road-intersection-path`, `road-crossroad-path`), except a 1-cell-wide local 4-way may take the 3×3 `road-roundabout` when the plus and empty corners fit (GEN-005). Arterial and collector T/4-way tiles use unsuffixed `road-intersection` / `road-crossroad` so catalog connectors match **logical** neighbors. Those junction meshes appear only at real crossings, not along a dual carriageway because the twin cell is adjacent. Kenney `*-line` meshes are not placed (they carry corner cubes). `road-straight` is only used for through-segments. Straights are not replaced with mid-block `road-crossing`. Pedestrians still cross those avenue junctions.
- **GEN-028:** Arterial and collector occupancy is a designed 2-cell carriageway (one cell per direction). The generator assigns that pair explicitly: parallel 1-cell centerlines that already touch collapse into the pair; a remaining 1-cell run dilates by one cell only when that does not merge two corridors into a 3-cell through-slab. Dual corridors that touch or sit one cell apart stitch into an L, T, or 4-way occupancy block; a 1-cell grass gap between avenues is invalid. An explicit lane-mate is not a street on a through-run; at a dual elbow the mate is the other leg of the turn. Dual T/4-way 2×2 cells with four openings use `road-crossroad`. Local streets remain 1-cell. `road-straight-half` is unused; two `road-straight` tiles meet at the median.

The structural hash excludes library identity, display name, and timestamps. It covers generator inputs plus the generated map, districts, graph (including `roadGraph.topology`), resolved road cells, sidewalks, blocks, lots, and entities, making it suitable for golden determinism tests.

- **GEN-029 (M3.6.2):** Generator `0.6.7` resolves and persists directed road topology after tile resolution, before sidewalks/land. It repairs missing reciprocal openings and incomplete avenue transitions using the existing catalog, preferring the fewest changed cells with a stable tie-break, then validates required maneuvers against measured carriageway and whole catalog body clearance. Unresolvable geometry or connectivity rejects the attempt under GEN-024 with location and reason; no decorative road is left without circulation and no required turn is dropped to pass. The `traffic` worker stage reports this validation. External gates use portals; internal terminals require physical returns. Resolved topology supersedes `(cell, heading)` inference for runtime navigation.
