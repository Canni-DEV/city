# M6 — Hardening and 1.0

## IDs and inputs

**Milestone:** M6. **Requirements:** all remaining PRD/FUN/UX/ACC/REN/DEP requirements and AC-001–012. Inputs are the feature-complete M5 product and accumulated PR evidence.

## Outputs and tasks

Close accessibility findings, tune performance/quality, validate migrations and fallback recovery, polish error/empty/loading states, finish credits and operator documentation, execute the full seed matrix and manual browser matrix, and prepare `1.0.0` release notes.

## Verification and evidence

All CI suites pass frozen. Manual QA covers Chrome/Edge, 1280×720/1920×1080, WebGPU/forced WebGL 2, keyboard/focus/contrast/patterns/reduced motion, 60 FPS at 1080p, and sub-five-second 128×128 generation. Link evidence for every matrix row.

## Exclusions and stop

No new product capabilities. Request final review; release `1.0.0` only after every requirement and acceptance criterion is approved.
