# Editor specification

- **EDT-001:** Editable objects are buildings, trees, street furniture, and decorations; roads and zoning are read-only in v1.
- **EDT-002:** Selection supports single, additive, and drag rectangle operations plus visible outline and inspector.
- **EDT-003:** Commands are Add, Delete, Move, Rotate, Duplicate, Multi-object transform, and Regenerate block.
- **EDT-004:** Every command exposes a user-visible name plus exact `apply` and `revert`, preserves IDs, and never reads wall-clock time internally.
- **EDT-005:** History stores 100 committed commands, clears redo on a new branch, consolidates each continuous drag, and is session-only.
- **EDT-006:** Buildings snap within valid lots and rotate in 90-degree steps. Decorations move and rotate freely.
- **EDT-007:** Placement uses footprints and spatial indexing. Overlap and invalid-boundary transforms are blocked with an explanation.
- **EDT-008:** Incompatible zones warn but do not block user placement and set the entity warning flag.
- **EDT-009:** Regenerate block is confirmed, replaces all block entities, retains the block ID, increments its regeneration index, and is one reversible command.
- **EDT-010:** Zone, lot, and grid overlays are independent and do not mutate the document.

Command transactions calculate the complete next document before commit. A failed command has no partial effect. Render proxies and instance indexes update after the committed document mutation.
