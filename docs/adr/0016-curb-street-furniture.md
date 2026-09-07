# ADR-0016: Sub-cell curb street furniture

**Status:** Accepted — 2026-09-06

## Decision

M3.7.1 places Kenney road-pack street furniture as `CityEntity` records on sidewalk cells with sub-cell transforms (curb/corner offsets). Those props **share** the sidewalk occupancy cell instead of claiming a unique spatial-hash cell. GEN-011 therefore does not treat curb furniture versus `sidewalks` as an overlap.

Curb-class furniture — catalog `street-furniture` or `street-utility` whose larger footprint axis is less than 0.25 cells (signs, pole traffic lights, street lamps, `electricity-pole-single`) — is excluded from the pedestrian obstacle set. Dumpsters and construction props remain obstacles and are placed against the lot-side of the sidewalk so a walking corridor of at least 0.30 cells remains.

Traffic lights are visual only. Vehicle simulation does not read them.

## Consequences

Leftover GEN-010 decoration no longer samples road-pack street furniture, so control devices are not scattered in yards. Pedestrian connectivity (TST-003/008) must still hold with furniture present. Building occupancy, road tiles, and vehicle clearance are unchanged. This does not replace ADR-003, ADR-005, ADR-008, or ADR-013/015 walkability of the sidewalk ring. M4 may edit these entities like any other decoration.
