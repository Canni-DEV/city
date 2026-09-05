# M1 — Road vertical slice

## IDs and inputs

**Milestone:** M1. **Requirements:** GEN-001–005, GEN-020–021, GEN-024–025, TST-001–003. Inputs are M0 contracts/catalog, normalized generator parameters, and road entries.

## Outputs and tasks

Implement versioned seeded streams, irregular mask/density fields, district centers, 2/3/4 gates, Delaunay candidate graph, connecting tree plus cycles, deterministic A*, tile resolution, validation/retry, worker progress/cancel, and a navigable small road scene.

## Verification and evidence

Prove same-input hashes, reproducible retries, exact gate counts, one road component, and no invalid connector combination across the required seed batch subset. Attach stage UI, road scene, both backend screenshots, commands, and timing.

## Exclusions and stop

No blocks, lots, zones, buildings, decoration, object editor, or persistence. Request review and stop before M2.

## Completion evidence

- Implemented generator version `0.2.0` and the six worker stages: mask, districts, graph, routing, tiles, and validation.
- Automated suites pass with a fixed structural hash, reproducible retry derivation, and 200 generated cities across all presets and sizes.
- The 64×64 reference city generated in approximately 24 ms during local UI QA; the automated 200-city batch completed in approximately 3.6 seconds.
- The road laboratory was manually exercised using WebGPU and forced WebGL 2. It exposes the active backend, road-cell/connection/gate counts, attempt, duration, progress, and cancellation control.
- Monorepo Biome check, typecheck, Vitest suites, and production build pass.

Review evidence should include screenshots from supported 1280×720 or 1920×1080 Chrome and Edge windows before accepting the milestone. M2 remains intentionally unstarted.
