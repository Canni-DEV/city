# Core package instructions

Own deterministic domain contracts, generation algorithms, validation, editor commands, and migrations. Do not import React, Three.js, browser storage, or UI packages. Pure functions receive all randomness and time as inputs. Every command requires exact apply/revert tests; every generation change requires golden determinism and batch-seed tests. Update `DATA_MODEL.md`, `GENERATOR_SPEC.md`, `EDITOR_SPEC.md`, and the requirements matrix when their contracts change.
