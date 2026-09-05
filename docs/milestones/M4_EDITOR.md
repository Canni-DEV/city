# M4 — Editor

## IDs and inputs

**Milestone:** M4. **Requirements:** FUN-020–025, UX-010–023, EDT-001–010, TST-004. Inputs are populated M3.5 documents after M3.6 runtime agents and M3.6.1 sidewalks, scene instance maps, footprints, lots, and zone compatibility.

## Outputs and tasks

Implement single/additive/rectangle selection, outline/inspector/gizmo, add/delete/move/rotate/duplicate/multi-transform commands, 100-step history, keyboard controls, valid-placement feedback, warnings, overlay controls, and confirmed reversible block regeneration.

## Verification and evidence

Unit-test exact apply/revert and IDs for every command plus gesture consolidation and history branching. Manually test every pointer/keyboard binding, focus, collision reason, zone warning, and regeneration in Chrome/Edge and both backends; attach before/after/undo screenshots.

## Exclusions and stop

No road or zoning editing and no persisted undo. Request review and stop before M5.
