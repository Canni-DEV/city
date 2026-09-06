# Functional specification

## Library

- **FUN-001:** The root route lists locally stored cities with create, open, duplicate, rename, and delete actions.
- **FUN-002:** Deletion requires confirmation; duplication creates a distinct ID and timestamps.
- **FUN-003:** Generating always creates a new city and never overwrites the open one.

## Generation form

- **FUN-010:** Map size is 64, 96, 128, or 256; default is 96.
- **FUN-011:** Name is editable, suggested automatically, required after trimming, and limited to 80 characters.
- **FUN-012:** Text seed is required after trimming and limited to 64 characters.
- **FUN-013:** Presets are Balanced, Suburban, Commercial Core, and Industrial City.
- **FUN-014:** Advanced controls expose zone mix, park share, density (`low` / `medium` / `high` / `very-high`), 2–8 districts, and 0–100 road regularity (organic manzanas → orthogonal grid), roundabouts, and decoration plus a theme.
- **FUN-015:** Zone weights normalize when generation is confirmed; park input is constrained to 0–25%.
- **FUN-016:** Progress reports stage, percent, and status; cancel leaves no partial city. Pedestrian and vehicle counts are runtime sliders (0–64) that respawn immediately and never write to `CityDocumentV1`.

## Editor

- **FUN-020:** The editor supports individual, additive, and rectangular selection, inspector, outline, and transform gizmo.
- **FUN-021:** Add, delete, move, rotate, duplicate, multi-object transform, and regenerate-block operations are undoable.
- **FUN-022:** Zone, lot, and grid overlays are independently toggleable.
- **FUN-023:** Buildings snap to lots and 90-degree rotations; decorations permit free placement and rotation.
- **FUN-024:** Overlaps are blocked with a reason. Zone incompatibility warns but permits placement.
- **FUN-025:** Block regeneration requires confirmation and replaces every entity in that block.

## Runtime agents and vehicles

- **FUN-040:** After generation, a small set of seeded pedestrians walks a reconstructible hybrid network (SIM-001–010, SIM-020–026). They are not selectable editor objects.
- **FUN-041:** The sidewalk portion of default walking uses the sidewalk ring plus local `*-path` and avenue unsuffixed T/4-way crossings (real junctions only, not the dual-carriageway median), not the carriageway.
- **FUN-042:** After generation, a small set of seeded vehicles drives the validated directed lane network (SIM-011–019). They are not selectable editor objects. Kenney bodies ship without wheels in M3.6.2.
- **FUN-043:** Traffic lanes is an independent diagnostic overlay with directed lane axes, turn connections, carriageway boundaries, portals, and pedestrian crossing references. It draws the same `DriveNetwork` the mover uses. Selecting a segment inspects connectivity and validation without editing roads or selecting vehicles. Escape clears that diagnostic selection. No pause, step, or follow-vehicle controls.

## Persistence and routes

- **FUN-030:** Routes are `#/`, `#/city/:cityId`, `#/credits`, and development-only `#/dev/assets`.
- **FUN-031:** Changes autosave after one second idle and refresh the thumbnail after ten seconds idle.
- **FUN-032:** Import accepts at most 25 MB, copies colliding IDs, migrates older versions explicitly, and rejects future versions clearly.
- **FUN-033:** Export produces a readable `.city.json` snapshot with generation provenance, without command history, runtime vehicles, reconstructed lane geometry, or diagnostic selection.

- **FUN-044:** M3.6.3 pedestrians wander on sidewalks and reachable parks, wait for safe traffic gaps, avoid other pedestrians and expose a Pedestrian navigation overlay with NPC/network inspection and shared Pause/Resume/Step. No editor selection or user-issued travel UI.
