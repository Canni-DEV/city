# Requirements matrix

| Area | Requirement IDs | Milestone | Acceptance / tests | Status |
|---|---|---|---|---|
| Product shell and scope | PRD-001–007, FUN-030 | M0 | AC-004, manual navigation | Implemented in M0 |
| Public data and worker contracts | DAT-001–009, ARC-005–007 | M0 | schema/type tests | Implemented in M0 |
| Asset inventory and viewer | AST-001–013 | M0 | TST-006, manual viewer | Implemented in M0 |
| Road generation | GEN-001–005, GEN-020–021, GEN-024–025 | M1 | TST-001–003, 200-city batch, golden hash | Implemented in M1 |
| Blocks, lots, zoning | GEN-006–008, FUN-010–016 | M2 | TST-002–003 | Implemented in M2 |
| Placement and rendering | GEN-009–011, REN-001–008 | M3 | AC-001–003, AC-010–012, TST-007 | Implemented in M3 |
| Urban morphology | GEN-003–007, GEN-020–022, FUN-014 | M3.5 | TST-001–003, 200-city batch, connector tests | Implemented in M3.5 |
| Runtime agents | SIM-001–007, FUN-040, PRD-006, REN-009, TST-008 | M3.6 | TST-008, manual agent QA | Implemented |
| Pedestrian sidewalks | SIM-002–004, SIM-007–010, GEN-022, GEN-026–027, DAT-008–009, FUN-041, TST-008 | M3.6.1 | TST-001–003, TST-008, manual sidewalk QA | Implemented |
| Two-cell avenues | GEN-004–005, GEN-027–028, DAT-002, FUN-041, SIM-009 | M3.6.1 hotfix | TST-001–003, connector tests, dual L/T/4-way stitch, 200-city batch | Implemented |
| Editing | FUN-020–025, UX-010–023, EDT-001–010 | M4 | TST-004, manual input QA | Planned |
| Persistence/library | FUN-001–003, FUN-031–033, PER-001–008 | M5 | TST-005 | Planned |
| Accessibility/release | UX-024, ACC-001–008, DEP-001–005 | M6 | AC-004, full manual QA | Planned |

“Implemented in M0” means the foundation artifact exists; verification evidence in the M0 pull request decides acceptance. Later milestone status changes only after its review gate.
