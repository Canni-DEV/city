# City agent instructions

## Mission

Implement City one reviewed milestone at a time. `CityDocumentV1` is the only source of truth. Generated rendering objects, indexes, thumbnails, and caches must always be reconstructable from it.

## Required workflow

1. Read `docs/INDEX.md`, the current milestone brief, and every specification linked by that brief.
2. Work on `milestone/mN-description` using Conventional Commits.
3. Keep requirement, acceptance, test, and milestone IDs intact in code, tests, and pull-request evidence.
4. Run `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before requesting review.
5. Update the requirements matrix, milestone brief, changelog, and affected specifications.
6. Stop after the milestone and wait for review. Do not begin the next milestone.

## Product invariants

- Generation is deterministic for the same generator version, seed, attempt, and parameters.
- Roads form one connected component and are not editable in v1.
- Procedural entities never overlap or leave the valid mask.
- User edits happen through reversible commands; continuous drags become one command.
- Runtime assets come from the generated catalog; original assets and licenses remain untouched.
- WebGPU initialization may fall back once to WebGL 2 without losing the open document.
- The product is local-only: no telemetry, server dependency, accounts, economy, or vehicle traffic. A bounded runtime pedestrian layer (M3.6 / M3.6.1 / SIM-001–010) is in scope; massive crowds are not.

## Scope boundaries

- Do not modify source files under `assets/`.
- Do not add elevated roads, road editing, zoning editing, PWA support, audio, massive crowd or vehicle simulation, or heavy post-processing in v1.
- Do not accept external contributions or add issue templates, Dependabot, or automated documentation validation.
- Ask for review when a required behavior would contradict an existing specification or ADR.
