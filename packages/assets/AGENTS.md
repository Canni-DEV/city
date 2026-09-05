# Assets package instructions

Own catalog schema, generation, overrides, validation, and runtime-copy tooling. Never alter files under `/assets`. Generated metadata must be reproducible, stable-ID based, and validated before use. Review exceptions through `catalog/overrides.json`, not ad-hoc application code. A valid catalog has exactly 213 unique GLB entries, valid paths and footprints, and complete road connectors. Update `ASSET_CATALOG.md` for catalog changes.
