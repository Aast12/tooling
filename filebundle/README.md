# filebundle

Temporary file + snippet transfer at `files.alamst.me`. Password-gated.
Bundles auto-expire (1h default, 7d max) and are hard-deleted from R2.

## Local dev

```bash
pnpm install
pnpm --filter filebundle migrate:local
pnpm --filter filebundle dev
```

For local dev, create a `.dev.vars` at the project root with:

```
UPLOAD_PASSWORD=dev-password
SESSION_SECRET=dev-secret-at-least-32-chars-long
```

## Tests

```bash
pnpm --filter filebundle test             # unit (31 tests)
pnpm --filter filebundle test:integration # handler-level flow (8 tests)
```

## First deploy

1. Fill in Cloudflare credentials:
   ```bash
   cd filebundle/terraform
   cp terraform.tfvars.example terraform.tfvars
   ```
2. Provision R2 bucket + D1 database:
   ```bash
   terraform init
   terraform apply -target=cloudflare_r2_bucket.filebundle -target=cloudflare_d1_database.filebundle
   ```
3. Copy the `d1_database_id` output into `wrangler.toml` and `sweep/wrangler.toml` (replace `REPLACE_WITH_REAL_ID_AFTER_TERRAFORM_APPLY`).
4. Set secrets (main Worker):
   ```bash
   cd ..
   wrangler secret put UPLOAD_PASSWORD   # your shared password
   wrangler secret put SESSION_SECRET    # openssl rand -hex 32
   ```
5. Apply D1 migrations:
   ```bash
   pnpm migrate:prod
   ```
6. Deploy the main Worker (Astro bundle) and the sweep Worker:
   ```bash
   pnpm deploy
   wrangler deploy --config sweep/wrangler.toml
   ```
7. Bind the custom domain (requires the Worker script to exist):
   ```bash
   cd terraform
   terraform apply
   ```

## Rotating the password

```bash
wrangler secret put UPLOAD_PASSWORD    # new password
wrangler secret put SESSION_SECRET     # rotate to force re-login
```

## Architecture

Two Workers share the same R2 bucket + D1 database:

- **`filebundle`** — Astro SSR app at `files.alamst.me`. Serves the upload UI, bundle view, download API, login.
- **`filebundle-sweep`** — cron Worker (`0 * * * *`) that deletes bundles past their `expires_at` and their R2 objects.

## Design

See [`docs/specs/2026-04-21-filebundle-design.md`](./docs/specs/2026-04-21-filebundle-design.md)
and [`docs/plans/2026-04-21-filebundle-implementation.md`](./docs/plans/2026-04-21-filebundle-implementation.md).
