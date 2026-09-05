# ADR-012: Runtime agents outside CityDocument

**Status:** Accepted — 2026-09-05

## Decision

Populate a small set of animated pedestrians at runtime from the open `CityDocumentV1` (seed plus occupied road cells). Agents are not `CityEntity` records, are not written to `.city.json`, and are not part of the generator document hash.

Walkability in M3.6 is the 4-connected occupied road-cell graph. Movement uses injected time and seeded RNG. Cell reservation handles meetings: wait, then repath. Idle and run clips drive a per-agent `SkinnedMesh`; jump is unused. Count is 8–16 on a 96×96 Auto/high view. Building and road GLB scale stays native; a single catalog/override scale factor may apply to agents only.

The mover/walk-policy interface must not be fused to “road graph only,” so a later player can leave the graph without rewriting avatars or animation. M3.6 does not ship that player.

This decision supersedes the absolute “no pedestrians / no simulation” reading of PRD-006 for a bounded runtime layer. It does not replace ADR-003, ADR-006 (instancing of city kits), or ADR-008’s city-kit catalog of 213 GLBs. Character runtime GLBs are generated **outside** `/assets` because the Kenney protagonists pack is FBX-only and AC-012 forbids packing source FBX.

## Consequences

City-kit generation, golden hashes, and export stay static. Catalog tests (TST-006) grow in M3.6 implementation to include generated protagonist GLBs and skins. Massive crowds, vehicle traffic, mesh physics, and user-controlled avatars remain out of this milestone.
