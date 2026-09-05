# City

City is a browser-based procedural city sandbox. It generates deterministic low-poly cities from Kenney City Kit packs, can show a small number of runtime pedestrians on the streets (M3.6), and will expose the resolved city as an editable, versioned document (M4).

Milestone M2 adds blocks, fronted lots, and five-zone assignment on top of the M1 road slice: presets, advanced mix controls, overlays, and invariant checks for frontage and area quotas. Buildings and decoration follow in M3.

## Requirements

- Node.js 24 LTS
- pnpm 10.34.5
- Chrome or Edge for manual 3D verification

## Commands

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm catalog
```

The road generator is available at `#/city/new`, and the development asset viewer at `#/dev/assets`. Add `?forceWebGL=1` before the hash to exercise the WebGL 2 fallback. Runtime-ready copies of GLB files and textures are generated into an ignored directory before development and production builds.

## Workspace

- `apps/web`: React application and 3D presentation.
- `packages/core`: domain schemas, deterministic contracts, and editor command interfaces.
- `packages/assets`: generated asset catalog and asset pipeline.
- `packages/ui`: accessible shared UI primitives and design tokens.
- `docs`: product, architecture, milestone, and acceptance specifications.
- `assets`: untouched source packs distributed by Kenney under CC0 1.0.

Start with [the documentation index](docs/INDEX.md) and [the repository agent instructions](AGENTS.md).

## License

Project code is MIT licensed. The Kenney packs retain their original CC0 1.0 license files. See [Credits](docs/ASSET_CATALOG.md#licensing-and-credits).
