# M1 — Road vertical slice

## IDs and inputs

**Milestone:** M1. **Requirements:** GEN-001–005, GEN-020–021, GEN-024–025, TST-001–003. Inputs are M0 contracts/catalog, normalized generator parameters, and road entries.

## Outputs and tasks

Implement versioned seeded streams, irregular mask/density fields, district centers, 2/3/4 gates, Delaunay candidate graph, connecting tree plus cycles, deterministic A*, tile resolution, validation/retry, worker progress/cancel, and a navigable small road scene.

## Verification and evidence

Prove same-input hashes, reproducible retries, exact gate counts, one road component, and no invalid connector combination across the required seed batch subset. Attach stage UI, road scene, both backend screenshots, commands, and timing.

## Exclusions and stop

No blocks, lots, zones, buildings, decoration, object editor, or persistence. Request review and stop before M2.
