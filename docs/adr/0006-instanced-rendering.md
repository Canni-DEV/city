# ADR-006: Instance repeated assets

**Status:** Accepted — 2026-09-04

## Decision

Group repeated entities by model and texture variant into `InstancedMesh` batches with stable entity/instance lookup. Render the active selection through a separate proxy.

## Consequences

Draw calls stay bounded for large cities. Edits must maintain lookup consistency and selection visuals cannot depend on per-instance post-processing.
