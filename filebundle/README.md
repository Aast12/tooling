# filebundle

Temporary file + snippet transfer at **[files.alamst.me](https://files.alamst.me)**. Password-gated. Bundles auto-expire (1h default, 7d max) and are hard-deleted from R2.

Bundles are **append-only sessions**: keep adding files/snippets to the same URL until it expires. Use the `+ add to this bundle` form on the bundle page, or the curl recipe below for server-side pushes.

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

## Server-side sessions (curl)

Useful when you're SSH'd into a box and want to drip files/snippets to a single bundle URL across a working session.

```bash
# 1. Log in once — store the session cookie.
curl -c /tmp/fb.jar -d "password=$UPLOAD_PASSWORD" \
  https://files.alamst.me/api/login

# 2. Create the bundle. Capture the slug from the redirect.
SLUG=$(curl -b /tmp/fb.jar -s -o /dev/null -w "%{redirect_url}" \
  -F "expiration=24h" \
  -F "snippet_content_1=session opened" \
  https://files.alamst.me/api/bundles | sed -E 's|.*/([^/?]+).*|\1|')
echo "https://files.alamst.me/$SLUG"

# 3. Append more items any time (until the bundle expires).
curl -b /tmp/fb.jar -F "files=@./build.log" \
  https://files.alamst.me/api/bundles/$SLUG/items

curl -b /tmp/fb.jar \
  -F "snippet_content_1=$(uname -a)" -F "snippet_name_1=host" \
  https://files.alamst.me/api/bundles/$SLUG/items
```

Limits apply to the whole bundle, not each request: max 20 items, 100 MB per file, 500 MB total. The endpoint returns `400` if a request would push the bundle past those limits, and `404` if the bundle has expired.

## Rate limiting

`/api/login` is rate-limited to 5 requests per minute per IP via the Workers Rate Limiting binding `LOGIN_LIMITER` (declared in `wrangler.toml`). Exceeded requests return 429 with `Retry-After: 60`.

## Analytics

Optional server-side capture to [PostHog](https://posthog.com). Disabled when `POSTHOG_API_KEY` is unset — no overhead, no errors. Enable it:

```bash
cd filebundle
echo -n "phc_yourProjectKey" | pnpm wrangler secret put POSTHOG_API_KEY
# EU users only:
# echo -n "https://eu.i.posthog.com" | pnpm wrangler secret put POSTHOG_HOST
```

Captured from the middleware (every non-asset request, fire-and-forget via `waitUntil`):

| Event | When |
| --- | --- |
| `request` | Normal request — properties: `path`, `method`, `status`, `authed`, `country`, `ip`, `user_agent`, `asn_org`, `bot_score`, `redirected_to_login` |
| `probe_detected` | Same shape as `request` plus `probe_reason`. Fired when path/UA matches known scanner patterns (sqlmap, nuclei, `/wp-admin`, `/.env`, `/.git`, path-traversal, SQLi/XSS chars, etc.) |
| `login_success` | Successful password match |
| `login_failure` | Wrong password |
| `login_rate_limited` | 429 returned by the per-IP limiter (5/min) |

`distinct_id` is the client IP, so PostHog's "Persons" view doubles as a "who's hitting me?" list. Useful filters in PostHog:

- `event = probe_detected` → all scanner traffic
- `event = login_failure | login_rate_limited` → brute-force attempts
- Insight grouped by `properties.country` or `properties.asn_org` → where probes come from
