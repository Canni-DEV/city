# ADR-010: Unit tests plus structured manual QA

**Status:** Accepted — 2026-09-04

## Decision

Use Vitest for deterministic domain, command, catalog, migration, and integration tests. CI has no percentage coverage threshold or Playwright suite; browser, backend, accessibility, screenshot, and performance evidence is manual per milestone.

## Consequences

Tests concentrate on invariants instead of a metric. Pull-request evidence is mandatory and M6 must close all manual QA before 1.0.
