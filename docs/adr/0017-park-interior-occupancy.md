# ADR-0017: Park interior shared occupancy

**Status:** Accepted — 2026-09-06

## Decision

M3.7.2 places structured park interiors as `CityEntity` records. Occupying props — Nature Kit trees, large bushes, statues, `suburban:planter`, and `nature:pot_large` — claim a unique spatial-hash cell and remain pedestrian obstacles.

Park-surface and garnish props — suburban plaza path strips, flowers, grass, `nature:pot_small`, and `nature:sign` — **share** the park cell instead of unique-hash occupancy. GEN-011 does not treat those records as overlaps against each other, against empty grass, or against path strips. They stay in-mask, off occupied road and sidewalk cells, and inside a park block. They are excluded from the pedestrian obstacle set so NPCs walk the plaza. Pathfinding code is not rewritten; reconstruction already ignores the non-obstacle allowlist (SIM-002).

Plaza paths never sit on sidewalk `tile-low` cells. The sidewalk ring remains the park’s street edge.

## Consequences

GEN-009 no longer scatter-places park trees (dummy RNG only). Leftover GEN-010 skips park-zone cells so courtyards stay free for `parkInterior`. Habitable parks keep a 4-connected walkable interior from sidewalk-adjacent cells around the statue. Pocket parks stay remnant groves and may remain unreachable, as before. Building, road, curb-furniture, and vehicle systems are unchanged. This does not replace ADR-0016. M4 may edit these entities like other decoration.
