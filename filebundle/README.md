# filebundle

Temporary file + snippet transfer at **[files.alamst.me](https://files.alamst.me)**. Password-gated. Bundles auto-expire (1h default, 7d max) and are hard-deleted from R2.

Two Cloudflare Workers share one R2 bucket and one D1 database:

| Worker | Purpose | Trigger |
| --- | --- | --- |
| `filebundle` | Astro SSR — upload UI, bundle view, download API, login | HTTP at `files.alamst.me` |
| `filebundle-sweep` | Deletes bundles past their `expires_at` + their R2 objects | Cron `0 * * * *` |

Provisioned infrastructure (already exists — do not recreate):

- R2 bucket: `filebundle`
- D1 database: `filebundle` (id in `wrangler.toml`)

## Updating the app

Push to `main`. That's it.

`.github/workflows/deploy.yml` runs on every push that touches `filebundle/**`, the workflow file itself, or `pnpm-lock.yaml`. It installs deps, runs unit + integration tests, applies any new D1 migrations, and deploys both Workers. Watch a run with `gh run watch -R Aast12/tooling`.

GitHub Actions secrets (already configured on `Aast12/tooling`):

- `CLOUDFLARE_API_TOKEN` — Workers Scripts edit + R2 edit + D1 edit + DNS edit scope
- `CLOUDFLARE_ACCOUNT_ID`

## Local dev

```bash
pnpm install
pnpm --filter filebundle migrate:local
pnpm --filter filebundle dev   # http://localhost:4321
```

Create `filebundle/.dev.vars` (gitignored) before first run:

```
UPLOAD_PASSWORD=pick-any-dev-password
SESSION_SECRET=any-random-string-at-least-32-chars
```

## Tests

```bash
pnpm --filter filebundle test              # 32 unit tests
pnpm --filter filebundle test:integration  # 8 handler-level flow tests
```

CI runs both on every push.

## Rotating Worker secrets

Secrets live on the Worker (set via `wrangler secret put`), not in CI. They persist across deploys.

```bash
cd filebundle
# needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in env
echo -n "new-password" | pnpm wrangler secret put UPLOAD_PASSWORD
openssl rand -hex 32 | pnpm wrangler secret put SESSION_SECRET   # invalidates all session cookies
```

## Fresh install (cloning from scratch)

Only needed if you're re-provisioning from zero.

```bash
# 0. Set Cloudflare auth for wrangler
export CLOUDFLARE_API_TOKEN=...           # Workers + R2 + D1 + DNS edit scope
export CLOUDFLARE_ACCOUNT_ID=...

# 1. Create R2 bucket + D1 database
cd filebundle
pnpm wrangler r2 bucket create filebundle
pnpm wrangler d1 create filebundle
# → copy the database_id from the output into wrangler.toml AND sweep/wrangler.toml

# 2. Apply D1 migrations
pnpm wrangler d1 migrations apply filebundle --remote

# 3. Set Worker secrets
echo -n "your-password" | pnpm wrangler secret put UPLOAD_PASSWORD
openssl rand -hex 32 | pnpm wrangler secret put SESSION_SECRET

# 4. First deploy
pnpm run deploy
pnpm wrangler deploy --config sweep/wrangler.toml

# 5. For ongoing push-to-main deploys, add repo secrets:
gh secret set CLOUDFLARE_API_TOKEN -R <owner>/<repo>
gh secret set CLOUDFLARE_ACCOUNT_ID -R <owner>/<repo>
```

The custom domain binding (`files.alamst.me`) is declared via `routes` in `wrangler.toml` — Cloudflare sets up DNS and certs automatically on first deploy, assuming the zone is on the same account.

## Design docs

- [`docs/specs/2026-04-21-filebundle-design.md`](./docs/specs/2026-04-21-filebundle-design.md) — spec
- [`docs/plans/2026-04-21-filebundle-implementation.md`](./docs/plans/2026-04-21-filebundle-implementation.md) — implementation plan
