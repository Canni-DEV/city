# ADR-009: Explicit reversible editor commands

**Status:** Accepted — 2026-09-04

## Decision

Every document edit is a named command with exact `apply` and `revert`. IDs are preserved, continuous gestures consolidate, and session history is capped at 100.

## Consequences

Undo behavior is testable and auditable. Features cannot mutate the document opportunistically; large block replacements must retain enough prior state to revert exactly.
