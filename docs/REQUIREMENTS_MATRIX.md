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
| Two-cell avenues | GEN-004–005, GEN-027–028, DAT-002, FUN-041, SIM-009 | M3.6.1 hotfix | TST-001–003, connector tests, dual L/T/4-way stitch, local 3×3 roundabouts, 200-city batch | Implemented |
| Runtime vehicles and explicit lanes | SIM-011–019, GEN-029, DAT-008, DAT-010, FUN-042–043, UX-025, PRD-006, REN-010, AST-001, AST-014, TST-009 | M3.6.2 | TST-001/006/008/009 and generate smokes on default CI; TST-002/003 occupancy census via `pnpm test:batch`; overlay inspector QA, manual backend and AC-010 QA; AC-001/011 complete a 128 city without a 5 s cap; visual QA that instanced bodies include static child wheels | Implemented, pending review |
| NPC refactor | SIM-001–010 amended, SIM-020–026, FUN-044, UX-026, DAT-008, AST-010, REN-009/010 | M3.6.3 | TST-006/008/009, AC-010/012, manual movement/overlay QA | Implemented; static checks pass, owner manual review pending |
| Zone-detail program | GEN-030+, GEN-032–033, AST-015–016, FUN-045–047, ADR-0016–0018 | M3.7 | Per sub-phase brief | Program open; 3.7.3 in this delivery |
| Curb street furniture | GEN-010/011 amended, GEN-030–031, SIM-002 amended, AST-015, FUN-045, TST-010 | M3.7.1 | TST-001/003/008/010, 200-city batch, owner visual QA | Implemented, pending review |
| Park interiors | GEN-009/010/011/026 amended, GEN-032, SIM-002 amended, AST-016, FUN-046, TST-011, ADR-0017 | M3.7.2 | TST-001/003/006/008/011, 200-city batch, owner visual QA | Implemented |
| Urban blocks / yards | GEN-009/010/011 amended, GEN-033, FUN-047, TST-012, ADR-0018 | M3.7.3 | TST-001/003/008/012, 200-city batch, owner visual QA | Implemented, pending review |
| Procedural NPC animation/control | FUN-040/044 amended, FUN-048, UX-011/026 amended, UX-027, SIM-027–030, REN-011, TST-013, ADR-0019 | M3.8 | package tests on Three 0.185.x; deterministic core/control tests; web selection/input/camera and production-exclusion tests; owner backend/performance QA | Implemented |
| Third-person follow and NPC locomotion | UX-011/027 amended, REN-011 amended, SIM-004/022 amended, TST-013 amended, ADR-0019 amended | M3.8.1 | TST-013 camera/locomotion; owner follow/zoom/yield QA | Implemented, pending review |
| Editing | FUN-020–025, UX-010–023, EDT-001–010 | M4 | TST-004, manual input QA | Planned |
| Persistence/library | FUN-001–003, FUN-031–033, PER-001–008 | M5 | TST-005 | Planned |
| Accessibility/release | UX-024, ACC-001–008, DEP-001–005 | M6 | AC-004, full manual QA | Planned |

“Implemented in M0” means the foundation artifact exists; verification evidence in the pull request decides acceptance. Later milestone status changes only after its review gate. M3.6.2 is implemented on `milestone/m3-6-2-vehicles` and stays pending until that review records automated checks and overlay performance evidence.
