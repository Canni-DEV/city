# M3 — Placement and rendering

## IDs and inputs

**Milestone:** M3. **Requirements:** GEN-009–011, REN-001–008, AC-001–003, AC-010–012, TST-007. Inputs are M2 lots/zones, validated catalog, renderer shell, and worker protocol.

## Outputs and tasks

Place footprint-valid buildings, parks, trees, furniture, and district themes via spatial hash; group instances by asset/variant; add stable instance mapping, quality profiles, sunlight/ambient/shadows/fog, diagnostics, fallback recovery, progress, and cancellation.

## Verification and evidence

Prove no procedural overlap/out-of-mask placement, complete references, deterministic hashes, and fallback document preservation. Record device and 128×128 generation time, 1080p frame rate, entity/draw-call counts, both backends, quality levels, and screenshots.

## Exclusions and stop

No object editing or persistent library. Request review and stop before M4.

## Completion evidence

- Implemented generator version `0.4.0` with spatial-hash placement of catalog buildings, park vegetation, decoration, and district texture palettes from the selected color theme.
- Worker progress stages now include `placement` and `decoration`. Cancelled generation never installs a partial document.
- Automated suites prove no overlapping procedural occupancy, no out-of-mask entities, complete catalog references, a fixed structural hash, reproducible retries, and 200 generated cities (50 seeds × 4 presets, sizes 64/96/128) with land and placement invariants.
- `TST-007` proves forced WebGL 2 fallback happens once and preserves the open `CityDocumentV1`. Quality and LOD swaps do not mutate the document.
- The city laboratory instances roads and entities, exposes Auto/Low/Medium/High quality, backend/FPS/entity/draw-call diagnostics, a read-only selection outline proxy, sunlight/ambient/shadows/fog, and `?forceWebGL=1` recovery.
- Monorepo Biome check, typecheck, Vitest suites, and production build pass.

Review evidence should include 128×128 generation time, 1080p frame-rate observations, entity and draw-call counts, both backends, quality levels, and screenshots from supported Chrome and Edge windows before accepting the milestone. M4 remains intentionally unstarted.
