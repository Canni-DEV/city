# Asset catalog

## Inventory

- **AST-001:** The city-kit catalog contains exactly 213 GLB models: 41 commercial, 37 industrial, 95 roads, and 40 suburban. M3.6 adds generated protagonist runtime GLBs and skins **outside** `/assets` (`packages/assets/generated/characters/`, FBX sources stay in `assets/kenney_animated-characters-protagonists/`). TST-006 requires 213 city-kit entries plus those protagonist GLBs and four PNG skins.
- **AST-002:** Original GLB, FBX, OBJ, previews, HTML documentation, textures, and CC0 license files remain unchanged under `/assets`.
- **AST-003:** Production preparation copies only catalog-referenced GLB models and textures to the ignored runtime directory.

## Entry contract

Each stable entry contains pack, source/runtime/preview paths, textures, category/subcategory, measured dimensions, footprint, vertical offset, front, rotations, compatible zones, procedural weight, road connectors, instancing, LOD relation, decoration/elevated/v1 flags, and review source.

- **AST-010:** Automatic GLB-bound and filename heuristics merge with `catalog/overrides.json`; overrides win. Road-tile connector heuristics follow Kenney Y-up (+X east, +Z south): straights east–west, ends east, T-junctions closed north, bends and curves west+south.
- **AST-011:** Validation rejects duplicate IDs, absent paths, invalid footprints, missing texture references, unresolved LOD IDs, and incomplete road connectors.
- **AST-012:** Elevated models remain visible in the catalog but have `availableInV1: false`.
- **AST-013:** `#/dev/assets` shows the selected model, pivot, axes, footprint metadata, front, rotations, connectors, zones, variants, flags, and active backend.

Regenerate city-kit metadata with `pnpm catalog`. Regenerate protagonist GLBs with `pnpm --filter @city/assets generate-characters` (reads FBX under `/assets`, writes GLB under `packages/assets/generated/characters/`). Do not hand-edit `catalog.generated.json`; encode exceptions in overrides and regenerate. Agent-only dimension overrides may correct Kenney FBX scale versus `commercial:building-a`; never rescale buildings or roads.

## Licensing and credits

The commercial, industrial, roads, suburban, and Animated Characters Protagonists packs are by [Kenney](https://kenney.nl/) and retain their included [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) notices. City source code uses the MIT License.
