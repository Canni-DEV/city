# ADR-015: Continuous component-based runtime pedestrians

**Status:** Accepted design — 2026-09-06, explicitly approved for implementation by the project owner. Implementation evidence remains subject to milestone review.

M3.6.3 replaces cell/lane reservations with continuous pedestrian poses, bounded acceleration, collision-checked local avoidance and a derived hybrid pedestrian network. Sidewalk corridors and complete crossings connect reachable park areas sampled at 0.1 cells. Existing objects remain obstacles; inaccessible parks do not change generation.

NPC identity, pose, locomotion, navigation, orders, crossing state and appearance are separate runtime components. Pure systems accept time and seed; moveTo and wait orders also drive wandering. No ECS framework, schedules, building interiors or economy are introduced.

A shared 60 Hz runtime clock advances vehicles and pedestrians, preserves frame backlog and pauses while hidden. Vehicles retain their existing speed and ghost behavior. Pedestrians wait for a predicted safe complete crossing including body clearance and exit availability, and seek an alternative after ten seconds. No traffic yielding is added.

Character scale is 75% of the existing body via catalog override. Idle/run blending follows actual speed. The shared pedestrian network and runtime state drive a keyboard-accessible diagnostic with pause and single step.

This explicitly supersedes ADR-013's rigid reservations and park exclusion, SIM-002–005/010 and ADR-014's exclusion of pedestrian coordination for this milestone. CityDocumentV1, original assets, generator version and hashes remain unchanged. Old cities without road topology do not acquire vehicles. Stop for M3.6.3 review before M4.
