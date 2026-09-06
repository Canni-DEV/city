# Asset catalog

## Inventory

- **AST-001:** The city-kit catalog contains exactly 213 GLB models: 41 commercial, 37 industrial, 95 roads, and 40 suburban. M3.6 adds generated protagonist runtime GLBs and skins **outside** `/assets` (`packages/assets/generated/characters/`, FBX sources stay in `assets/kenney_animated-characters-protagonists/`). M3.6.2 catalogs 11 Kenney Car Kit bodies as pack `cars` from untouched `assets/kenney_car-kit/` GLB (sedan, sedan-sports, hatchback-sports, suv, suv-luxury, taxi, van, police, ambulance, firetruck, garbage-truck). TST-006 requires 213 city-kit entries plus protagonist GLBs and four PNG skins plus those 11 `cars:*` entries. Karts, race, tractors, debris, cones, and loose wheels are not cataloged.
- **AST-002:** Original GLB, FBX, OBJ, previews, HTML documentation, textures, and CC0 license files remain unchanged under `/assets`.
- **AST-003:** Production preparation copies only catalog-referenced GLB models and textures to the ignored runtime directory.

## Entry contract

Each stable entry contains pack, source/runtime/preview paths, textures, category/subcategory, measured dimensions, footprint, vertical offset, front, rotations, compatible zones, procedural weight, road connectors, instancing, LOD relation, decoration/elevated/v1 flags, and review source.

- **AST-010:** Automatic GLB-bound and filename heuristics merge with `catalog/overrides.json`; overrides win. Road-tile connector heuristics follow Kenney Y-up (+X east, +Z south): straights east–west, ends east, T-junctions closed north, bends and curves west+south.
- **AST-011:** Validation rejects duplicate IDs, absent paths, invalid footprints, missing texture references, unresolved LOD IDs, and incomplete road connectors.
- **AST-012:** Elevated models remain visible in the catalog but have `availableInV1: false`.
- **AST-013:** `#/dev/assets` shows the selected model, pivot, axes, footprint metadata, front, rotations, connectors, zones, variants, flags, and active backend.

Regenerate city-kit metadata with `pnpm catalog`. Regenerate protagonist GLBs with `pnpm --filter @city/assets generate-characters` (reads FBX under `/assets`, writes GLB under `packages/assets/generated/characters/`). Kenney animation FBX files include a short `0.Targeting Pose` (T-pose) beside Idle/Run/Jump; export selects the named locomotion clip and rejects durations under 0.2s. Do not hand-edit `catalog.generated.json`; encode exceptions in overrides and regenerate. Agent-only dimension overrides may correct Kenney FBX scale versus `commercial:building-a`; vehicle `uniformScale` overrides fit Car Kit length to about 0.54 cells; never rescale buildings or roads.

## Licensing and credits

The commercial, industrial, roads, suburban, Animated Characters Protagonists, and Car Kit packs are by [Kenney](https://kenney.nl/) and retain their included [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) notices. City source code uses the MIT License.

- **AST-014 (M3.6.2):** Reviewed `driveProfile` overrides define surface height and local road ports (plus `curveCenter` on 2×2 curves). Covered tiles: `road-straight`, `road-end`, `road-bend`, `road-bend-sidewalk`, `road-curve`, `road-intersection`, `road-intersection-path`, `road-crossroad`, `road-crossroad-path`, and `road-roundabout`. Catalog generation extracts upward-facing surface triangles from the original GLB at that height, excluding raised curbs and the roundabout island. Ports and curve references respect each tile’s position and yaw. `vehicleBounds` measures X/Z body bounds including node hierarchy translations and pivots, excluding wheel nodes. Runtime clearance applies each entry’s existing `uniformScale`. The catalog remains reproducible; original assets are untouched.

M3.6.3 sets protagonists:character-medium uniformScale to 0.75 in reviewed overrides, giving nominal height 0.24 from the existing 0.32-unit GLB. Buildings, roads, body GLBs and source FBX stay unchanged. Idle/run Root translation channels are already stationary; retain them and test the invariant rather than removing skeletal motion.
