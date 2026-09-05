# M3.5 — Urban morphology

## IDs and inputs

**Milestone:** M3.5. **Requirements:** GEN-003–007, GEN-020–022, FUN-014, DAT-002, TST-001–003. Inputs are the merged M3 generator (`0.4.0`), Kenney ground-level road tiles, and closed M1/M2/M3 contracts. This milestone does not start M4.

## Outputs and tasks

Reopen road-graph construction, tile resolution, and lot subdivision so generated cities read as sectors of closed blocks. Keep placement (GEN-009–011) unchanged aside from occupancy derived from road footprints.

- Reinterpret regularity 0–100 as organic → orthogonal block mesh (FUN-014 / GEN-003).
- Route arterial/collector links with long cardinal runs and 90° elbows; overlay a local 1-cell street mesh that closes manzanas (~8–12 free cells on 96/128, ~6–8 on 64).
- Resolve Kenney tiles from neighbor topology, road class, and catalog connectors; yaw must match the renderer Y-negation convention.
- Place `roads:road-curve` (2×2) on arterial/collector elbows when the footprint fits; local streets keep 1×1 bends.
- Flood-fill blocks without 4×4 zoning patches; pack a frontage ring of lots (depth 3–4) and leave a courtyard; zone whole manzanas.

## Verification and evidence

Prove determinism (`GENERATOR_VERSION` `0.5.0`), connector-accurate tiles, one 4-connected road-cell component, frontage on every lot, zone quotas ±5 points, and 200 cities (50 seeds × 4 presets, sizes 64/96/128). Attach overlay screenshots showing closed blocks, distinct avenue tiles, and correctly joined curves/bends on WebGPU and WebGL 2.

## Exclusions and stop

No object editor, road editing, zoning editing, 2-cell-wide carriageways, elevated roads, or placement-weight retunes. Request review and stop before M4.

## Completion evidence

- Implemented generator version `0.5.0` with hierarchical arterial/local mesh, connector-resolved tiles, multi-cell road occupancy, street-bounded blocks, and ring lots.
- Automated suites pass a new structural hash, reproducible retries, morphology invariants, and the 200-city batch.
- Monorepo Biome check, typecheck, Vitest suites, and production build pass.
