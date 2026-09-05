# M5 — Local library

## IDs and inputs

**Milestone:** M5. **Requirements:** FUN-001–003, FUN-031–033, PER-001–008, TST-005. Inputs are versioned M4 documents and browser persistence adapters.

## Outputs and tasks

Implement Dexie schema/migrations, local library create/open/duplicate/rename/delete, one-second autosave, ten-second thumbnail, readable export, guarded 25 MB import, collision copying, old-version migration, future-version rejection, and quota failure recovery.

## Verification and evidence

Test round trips, transactions, timers, invalid JSON/schema/references, oversize files, collision, each migration, future schema, and simulated quota failure. Attach complete library/export/import/recovery screenshots and confirm history does not survive reload.

## Exclusions and stop

No cloud sync, accounts, telemetry, or persistent history. Request review and stop before M6.
