# ADR-002: React Three Fiber with WebGPU fallback

**Status:** Accepted — 2026-09-04

## Decision

Render through React Three Fiber and asynchronously create Three.js `WebGPURenderer`. If initialization fails, recreate once with forced WebGL 2 and expose the active backend.

## Consequences

Scene composition remains declarative and current browsers receive WebGPU when available. Materials and helpers must support both backends, and renderer state cannot own the city document.
