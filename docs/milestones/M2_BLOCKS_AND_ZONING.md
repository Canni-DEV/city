# M2 — Blocks and zoning

## IDs and inputs

**Milestone:** M2. **Requirements:** FUN-010–016, GEN-006–008, GEN-022–023, TST-002–003. Inputs are M1 connected road cells and the four preset constants.

## Outputs and tasks

Flood-fill free regions, create blocks, subdivide rectangular fronted lots, normalize advanced zone controls, assign five zones from spatial factors and quotas, expose preset/advanced UI and overlays, and validate frontage, references, and area mix.

## Verification and evidence

Run 50 seeds per preset distributed over 64/96/128; prove every buildable lot has road frontage and zone shares are within ±5 points. Attach preset UI and zone/lot/grid overlay screenshots in both browsers.

## Exclusions and stop

No populated buildings/decorations, editing, local library, or performance sign-off. Request review and stop before M3.

## Completion evidence

- Implemented generator version `0.3.0` with flood-filled blocks, rectangular fronted lots, normalized zone weights, and five-zone assignment from spatial scores plus area quotas.
- Worker progress stages now include `blocks`, `lots`, and `zones`. Cancelled generation never installs a partial document.
- Automated suites pass a fixed structural hash, reproducible retries, independent land-invariant checks, and 200 generated cities (50 seeds × 4 presets, sizes 64/96/128) with frontage and ±5 zone-share rules. The 200-city batch completed in approximately 6.9 seconds.
- The city laboratory exposes presets, advanced zone/park/district/regularity/roundabout/decoration/theme controls, independent zone/lot/grid overlays, color-plus-pattern legend with actual versus target shares, progress, and cancellation.
- Monorepo Biome check, typecheck, Vitest suites, and production build pass.

Review evidence should include preset UI and zone/lot/grid overlay screenshots from supported 1280×720 or 1920×1080 Chrome and Edge windows before accepting the milestone. M3 remains intentionally unstarted.
