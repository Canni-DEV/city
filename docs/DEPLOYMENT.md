# Deployment

- **DEP-001:** Vite builds with base `/city/` and hash routing so static hosts need no rewrite rule.
- **DEP-002:** Every successful merge/push to `main` verifies and deploys `apps/web/dist` to standard GitHub Pages.
- **DEP-003:** Deployment uses no custom domain, service worker, telemetry, secrets, or server runtime.
- **DEP-004:** Production excludes `#/dev/assets` and copies only catalog-referenced runtime models and textures.
- **DEP-005:** The public repository licenses code under MIT and preserves Kenney pack CC0 notices and original documentation.

Release versions start at `0.x`. `1.0.0` is authorized only when M0–M6 and every acceptance entry in the requirements matrix are complete.
