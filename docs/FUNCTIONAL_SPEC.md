# Functional specification

## Library

- **FUN-001:** The root route lists locally stored cities with create, open, duplicate, rename, and delete actions.
- **FUN-002:** Deletion requires confirmation; duplication creates a distinct ID and timestamps.
- **FUN-003:** Generating always creates a new city and never overwrites the open one.

## Generation form

- **FUN-010:** Map size is 64, 96, or 128; default is 96.
- **FUN-011:** Name is editable, suggested automatically, required after trimming, and limited to 80 characters.
- **FUN-012:** Text seed is required after trimming and limited to 64 characters.
- **FUN-013:** Presets are Balanced, Suburban, Commercial Core, and Industrial City.
- **FUN-014:** Advanced controls expose zone mix, park share, 2–8 districts, and 0–100 road regularity (organic manzanas → orthogonal grid), roundabouts, and decoration plus a theme.
- **FUN-015:** Zone weights normalize when generation is confirmed; park input is constrained to 0–25%.
- **FUN-016:** Progress reports stage, percent, and status; cancel leaves no partial city.

## Editor

- **FUN-020:** The editor supports individual, additive, and rectangular selection, inspector, outline, and transform gizmo.
- **FUN-021:** Add, delete, move, rotate, duplicate, multi-object transform, and regenerate-block operations are undoable.
- **FUN-022:** Zone, lot, and grid overlays are independently toggleable.
- **FUN-023:** Buildings snap to lots and 90-degree rotations; decorations permit free placement and rotation.
- **FUN-024:** Overlaps are blocked with a reason. Zone incompatibility warns but permits placement.
- **FUN-025:** Block regeneration requires confirmation and replaces every entity in that block.

## Runtime agents

- **FUN-040:** After generation, a small set of seeded pedestrians walks the occupied road graph (SIM-001–007). They are not selectable editor objects in M3.6.

## Persistence and routes

- **FUN-030:** Routes are `#/`, `#/city/:cityId`, `#/credits`, and development-only `#/dev/assets`.
- **FUN-031:** Changes autosave after one second idle and refresh the thumbnail after ten seconds idle.
- **FUN-032:** Import accepts at most 25 MB, copies colliding IDs, migrates older versions explicitly, and rejects future versions clearly.
- **FUN-033:** Export produces a readable `.city.json` snapshot with generation provenance and no command history.
