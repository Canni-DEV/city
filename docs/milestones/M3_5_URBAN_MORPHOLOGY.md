# M3.5 — Urban morphology

## IDs and inputs

**Milestone:** M3.5. **Requirements:** GEN-003–007, GEN-020–022, FUN-014, DAT-002, TST-001–003. Inputs are the merged M3 generator (`0.4.0`), Kenney ground-level road tiles, and closed M1/M2/M3 contracts. This milestone does not start M4 or the M3.6 agent runtime.

## Outputs and tasks

Reopen road-graph construction, tile resolution, and lot subdivision so generated cities read as sectors of closed blocks. Keep placement (GEN-009–011) unchanged aside from occupancy derived from road footprints.

- Reinterpret regularity 0–100 as organic → orthogonal block mesh (FUN-014 / GEN-003).
- Route arterial/collector links with long cardinal runs and 90° elbows; overlay a local 1-cell street mesh that closes manzanas (~8–12 free cells on 96/128, ~6–8 on 64).
- Resolve Kenney tiles from neighbor topology, road class, and catalog connectors; yaw must match the renderer Y-negation convention.
- Place `roads:road-curve` (2×2) on arterial/collector elbows when the footprint fits; local streets keep 1×1 bends.
- Place `roads:road-roundabout` (3×3) on arterial 4-ways when four approach cells and free corners fit; otherwise keep a 1×1 cross.
- Flood-fill blocks without 4×4 zoning patches; pack a frontage ring of lots (depth 3–4) and leave a courtyard; zone whole manzanas.

## Verification and evidence

Prove determinism (`GENERATOR_VERSION` `0.5.0`), connector-accurate tiles, one 4-connected road-cell component, frontage on every lot, zone quotas ±5 points, and 200 cities (50 seeds × 4 presets, sizes 64/96/128). Attach overlay screenshots showing closed blocks, distinct avenue tiles, and correctly joined curves/bends on WebGPU and WebGL 2.

## Exclusions and stop

No object editor, road editing, zoning editing, elevated roads, placement-weight retunes, or M3.6 agent runtime. Request review and stop before M3.6 implementation.

The “no 2-cell-wide carriageways” exclusion of this milestone is **superseded** by the M3.6.1 avenue hotfix (`docs/milestones/M3_6_1_AVENUES.md`, generator `0.6.6`): arterial/collector corridors are now intentional 2-cell carriageways with designed dual L/T/4-way blocks, and 1-cell-wide local 4-ways may take the 3×3 Kenney roundabout. This brief is not rewritten as if M3.5 already shipped that geometry.

## Completion evidence

- Implemented generator version `0.5.0` with hierarchical arterial/local mesh, connector-resolved tiles, multi-cell road occupancy, street-bounded blocks, and ring lots.
- Kenney `road-bend` / `road-curve` identity is west+south; arterial 4-ways may place a 3×3 `road-roundabout` when the footprint and approach cells fit.
- The city canvas fills a definite viewport grid track so the first generated city is visible without a window resize (REN-001).
- Automated suites pass a new structural hash, reproducible retries, morphology invariants, and the 200-city batch.
- Monorepo Biome check, typecheck, Vitest suites, and production build pass.
