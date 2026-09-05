# ADR-001: pnpm monorepo

**Status:** Accepted — 2026-09-04

## Decision

Use Node.js 24 LTS and a pnpm 10 workspace containing `apps/web`, `packages/core`, `packages/assets`, and `packages/ui`, with exact tool versions and a committed lockfile.

## Consequences

Package boundaries make ownership enforceable and workspace linking fast. CI and contributors require the pinned Node/pnpm major versions; cross-package cycles are prohibited.
