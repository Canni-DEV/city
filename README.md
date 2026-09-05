# City

City is a browser-based procedural city sandbox and editor. It generates deterministic low-poly cities from the Kenney City Kit asset family and exposes the resolved city as an editable, versioned document.

Milestone M0 establishes the repository, contracts, asset catalog, internal asset viewer, and implementation specifications. Product generation begins in M1.

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

The development asset viewer is available at `#/dev/assets`. Runtime-ready copies of GLB files and textures are generated into an ignored directory before development and production builds.

## Workspace

- `apps/web`: React application and 3D presentation.
- `packages/core`: domain schemas, deterministic contracts, and editor command interfaces.
- `packages/assets`: generated asset catalog and asset pipeline.
- `packages/ui`: accessible shared UI primitives and design tokens.
- `docs`: product, architecture, milestone, and acceptance specifications.
- `assets`: untouched source packs distributed by Kenney under CC0 1.0.

Start with [the documentation index](docs/INDEX.md) and [the repository agent instructions](AGENTS.md).

## License

Project code is MIT licensed. The four asset packs retain their original CC0 1.0 license files. See [Credits](docs/ASSET_CATALOG.md#licensing-and-credits).
