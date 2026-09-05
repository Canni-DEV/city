# Architecture

## Boundaries

```mermaid
flowchart LR
  UI[packages/ui] --> WEB[apps/web]
  ASSET[packages/assets] --> WEB
  CORE[packages/core] --> ASSET
  CORE --> WEB
  WEB --> WORKER[Generation worker]
  WEB --> DB[(Dexie / IndexedDB)]
  DOC[CityDocumentV1] --> WEB
  DOC --> DB
```

- **ARC-001:** `packages/core` owns pure domain rules, deterministic generation, commands, validation, and migrations.
- **ARC-002:** `packages/assets` owns generated catalog metadata, overrides, validation, and runtime copying.
- **ARC-003:** `packages/ui` owns accessible reusable presentation without domain state.
- **ARC-004:** `apps/web` composes routes, workers, persistence, and rendering.
- **ARC-005:** `CityDocumentV1` is the single persisted source of truth; scene graphs, spatial hashes, instance maps, and thumbnails are derived.
- **ARC-006:** Generation runs in one worker with discriminated, Zod-validated messages and active-request filtering.
- **ARC-007:** State uses Zustand with Immer at application boundaries; domain functions remain framework-independent.

## Generation lifecycle

```mermaid
sequenceDiagram
  participant UI
  participant Worker
  participant Core
  UI->>Worker: generate(requestId, inputs)
  Worker->>Core: deterministic pipeline
  Worker-->>UI: progress(stage, percent, status)
  UI-->>Worker: cancel(requestId) optional
  Worker-->>UI: complete | cancelled | error
  UI->>UI: accept only active requestId
```

## Dependency rule

Dependencies point inward toward core contracts. Core never imports browser, rendering, persistence, or UI modules. Runtime asset paths are catalog-driven and no application feature reaches into original pack folders directly.
