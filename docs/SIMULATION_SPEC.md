# Simulation specification

Runtime agents are derived from `CityDocumentV1`. They are not persisted. M3.6 is a bounded pedestrian layer, not a city simulator.

- **SIM-001:** Agents are reconstructible from the open document seed and occupied road graph. They are not `CityEntity` values, do not appear in export, and do not change generator hashes.
- **SIM-002:** The walkable graph is the set of occupied `roadGraph` cells (one 4-connected component). Parks, lots, and courtyards are not walkable in M3.6.
- **SIM-003:** Pathfinding is A* on that graph in `@city/core`. Randomness and time are function inputs. Destinations are other road cells; arriving picks a new destination.
- **SIM-004:** Each agent reserves its current cell (and the cell it is stepping into). If the next cell is reserved, the agent waits; if it stays reserved, it replans A* to a new destination. There is no mesh-vs-mesh physics in M3.6.
- **SIM-005:** Clips are Kenney `idle` (stopped) and `run` (moving). `jump` is cataloged and unused. The four protagonist skins (`skaterMaleA`, `skaterFemaleA`, `cyborgFemaleA`, `criminalMaleA`) are assigned with RNG derived from the city seed.
- **SIM-006:** A 96×96 Auto/high view shows 8–16 agents. Low quality may reduce the count. This layer must not break AC-010.
- **SIM-007:** Movement is a walk policy separate from animation. M3.6 binds the policy to the road graph; a later player may use a different policy without replacing the avatar.

Kenney City Kit scale stays native (one map cell = one world unit). Agent GLB scale starts native; if the character is disproportionate versus `commercial:building-a` (~1.3 units tall), one override factor applies to agents only.
