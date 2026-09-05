# City

City is a browser-based procedural city sandbox and editor. It generates deterministic low-poly cities from the Kenney City Kit asset family and exposes the resolved city as an editable, versioned document.

Milestone M1 adds the first playable vertical slice: deterministic road generation in a worker, validated city gates and connections, modular Kenney road tiles, and a navigable 3D scene. Blocks and zoning follow in M2.

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

Project code is MIT licensed. The four asset packs retain their original CC0 1.0 license files. See [Credits](docs/ASSET_CATALOG.md#licensing-and-credits).
