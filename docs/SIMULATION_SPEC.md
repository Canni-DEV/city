# Simulation specification

Runtime agents are derived from `CityDocumentV1`. They are not persisted. M3.6/M3.6.1 is a bounded pedestrian layer, not a city simulator.

- **SIM-001:** Agents are reconstructible from the open document seed and the pedestrian walk graph. They are not `CityEntity` values, do not appear in export, and do not change generator hashes (sidewalk cells and path tiles do, because they are document fields).
- **SIM-002:** The walkable graph is sidewalk cells union junction crossings (one 4-connected component). Carriageway cells that are not crossings are not walkable. Lots, courtyards, and park interiors are not walkable.
- **SIM-003:** Pathfinding is A* on that graph in `@city/core`. Randomness and time are function inputs. Destinations are other sidewalk cells; arriving picks a new destination. Crossings are traversed, not chosen as goals.
- **SIM-004:** Each agent reserves its current `(cell, lane)` and the `(cell, lane)` it is stepping into. Two lanes per cell allow opposite-direction passing. If both lanes of the next cell are reserved, the agent waits; if they stay reserved, it replans A* to a new destination. There is no mesh-vs-mesh physics.
- **SIM-005:** Clips are Kenney `idle` (stopped) and `run` (moving). `jump` is cataloged and unused. The four protagonist skins (`skaterMaleA`, `skaterFemaleA`, `cyborgFemaleA`, `criminalMaleA`) are assigned with RNG derived from the city seed. Default travel speed is about one-third of a cell per second so the run cycle reads as a walk.
- **SIM-006:** A 96×96 Auto/high view shows 8–16 agents. Low quality may reduce the count. This layer must not break AC-010.
- **SIM-007:** Movement is a walk policy separate from animation. M3.6.1 binds the default policy to the sidewalk/crossing graph; `createRoadWalkPolicy` remains injectable. A later player may use a different policy without replacing the avatar.
- **SIM-008:** After blocks are flood-filled, every **habitable** block cell 4-adjacent to occupied road becomes a 1-cell sidewalk belonging to that manzana (parks with an interior included). Mask-edge sides with no road stay incomplete. Remnants too thin to keep an interior after the ring are pocket parks without sidewalks.
- **SIM-009:** Pedestrian crossings are local T and 4-way Kenney `*-path` tiles and their immediate occupied-road arms, arterial/collector T and 4-way `road-intersection` / `road-crossroad` cells (real crossings only) and their arms, sidewalk-corner road cells, and the four approach cells of a 3×3 roundabout. There are no mid-block crosswalks. Dual-carriageway through-segments are not crossings.
- **SIM-010:** Each walkable cell has two logical lanes. Agents prefer the right-hand lane for their heading (world offset about 0.2 units). Spawn uses unique `(cell, lane)` pairs on sidewalk cells only.

Kenney City Kit scale stays native (one map cell = one world unit). Agent GLB scale starts native; if the character is disproportionate versus `commercial:building-a` (~1.3 units tall), one override factor applies to agents only.
