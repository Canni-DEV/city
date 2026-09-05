# Deployment

- **DEP-001:** Vite builds with base `/city/` and hash routing so static hosts need no rewrite rule.
- **DEP-002:** Every successful merge/push to `main` verifies and deploys `apps/web/dist` to standard GitHub Pages.
- **DEP-003:** Deployment uses no custom domain, service worker, telemetry, secrets, or server runtime.
- **DEP-004:** Production excludes `#/dev/assets` and copies only catalog-referenced runtime models and textures.
- **DEP-005:** The public repository licenses code under MIT and preserves Kenney pack CC0 notices and original documentation.

Release versions start at `0.x`. `1.0.0` is authorized only when M0–M6 and every acceptance entry in the requirements matrix are complete.

## Initial Pages setup and recovery (DEP-002–003)

A repository administrator must select **Settings → Pages → Build and deployment → Source → GitHub Actions** once. `actions/configure-pages@v5` reads that site configuration; a `Get Pages site failed / Not Found` error means the site is unavailable to the workflow. Confirm this setting before rerunning the failed workflow. Deploy Pages also supports manual dispatch after its workflow reaches `main`.

Do not add `enablement: true` with the default `GITHUB_TOKEN`: automatic enablement requires a separate privileged token. Keep the secret-free deployment contract. The Node 20 action-runtime deprecation notice is independent of a Pages API 404; application builds use Node 24.
