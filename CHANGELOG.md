# Changelog

All notable changes use Semantic Versioning. The project remains in `0.x` until M0–M6 and every 1.0 acceptance criterion are complete.

## [Unreleased]

## [0.3.0] - 2026-09-04

### Added

- Deterministic M2 land generation: flood-filled blocks, rectangular road-fronted lots, normalized advanced zone controls, and five-zone assignment within ±5 area points.
- Preset and advanced generator controls for zone mix, parks, districts, regularity, roundabouts, decoration, and theme.
- Independent zone, lot, and grid overlays with color-plus-pattern legends of actual versus target zone shares.
- Land invariant, golden-hash, cancellation, and 200-city preset/size batch tests covering frontage and quotas.

## [0.2.0] - 2026-09-04

### Added

- Deterministic M1 road generator with irregular masks, density fields, polycentric districts, external gates, Delaunay candidate graphs, spanning connections, cycles, A* routing, modular tile resolution, validation, and reproducible retries.
- Generation worker with progress, cancellation, active-request filtering, and validated public messages.
- Navigable road laboratory with Kenney models, readable road underlay, district and gate markers, and WebGPU/WebGL 2 diagnostics.
- Generator golden-hash, retry, and 200-city preset/size batch tests.

## [0.1.0] - 2026-09-04

### Added

- M0 monorepo, product specifications, public contracts, generated asset catalog, internal viewer, application shell, CI, and deployment workflow.

### Repository

- Established the public repository baseline and preserved the four original CC0 Kenney asset packs.
