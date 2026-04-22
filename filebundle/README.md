# filebundle

Temporary file + snippet transfer at `files.alamst.me`. Password-gated.
Bundles auto-expire (1h default, 7d max) and are hard-deleted from R2.

Two Workers share the same R2 bucket + D1 database:

- **`filebundle`** — Astro SSR app at `files.alamst.me`. Upload UI, bundle view, download API, login.
- **`filebundle-sweep`** — cron Worker (`0 * * * *`) that deletes bundles past their `expires_at` and their R2 objects.

## Local dev

```bash
pnpm install
pnpm --filter filebundle migrate:local
pnpm --filter filebundle dev
```

Create `filebundle/.dev.vars` (gitignored) before first run:

```
UPLOAD_PASSWORD=pick-anything-local
SESSION_SECRET=any-random-string-at-least-32-chars
```

## Tests

```bash
pnpm --filter filebundle test              # unit
pnpm --filter filebundle test:integration  # handler flow
```

## Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml` which runs tests, applies D1 migrations, and deploys both Workers. Two GitHub Actions secrets are needed:

- `CLOUDFLARE_API_TOKEN` — Workers Scripts + R2 + D1 + DNS edit scope
- `CLOUDFLARE_ACCOUNT_ID`

Production Worker secrets are set once via `wrangler secret put` (not via CI). Rotate when needed:

```bash
cd filebundle
pnpm wrangler secret put UPLOAD_PASSWORD    # new password
pnpm wrangler secret put SESSION_SECRET     # invalidates existing session cookies
```

## Fresh install (cloning from scratch)

If you forked or are re-provisioning:

```bash
# 1. Create the R2 bucket and D1 database
pnpm wrangler r2 bucket create filebundle
pnpm wrangler d1 create filebundle
# → copy the database_id from the output into wrangler.toml and sweep/wrangler.toml

# 2. Apply migrations
pnpm --filter filebundle wrangler d1 migrations apply filebundle --remote --yes

# 3. Set Worker secrets
cd filebundle
pnpm wrangler secret put UPLOAD_PASSWORD
pnpm wrangler secret put SESSION_SECRET     # paste `openssl rand -hex 32`

# 4. First deploy
pnpm deploy
pnpm wrangler deploy --config sweep/wrangler.toml

# 5. Add GitHub Actions secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID; subsequent pushes auto-deploy.
```

## Design docs

- [`docs/specs/2026-04-21-filebundle-design.md`](./docs/specs/2026-04-21-filebundle-design.md)
- [`docs/plans/2026-04-21-filebundle-implementation.md`](./docs/plans/2026-04-21-filebundle-implementation.md)
