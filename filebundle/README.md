# filebundle

Temporary file + snippet transfer at **[files.alamst.me](https://files.alamst.me)**. Password-gated. Bundles auto-expire (1h default, 7d max) and are hard-deleted from R2.

Bundles are **append-only sessions**: keep adding files/snippets to the same URL until it expires. Use the `+ add to this bundle` form on the bundle page, or the curl recipe below for server-side pushes.

Two Cloudflare Workers share one R2 bucket and one D1 database:

| Worker | Purpose | Trigger |
| --- | --- | --- |
| `filebundle` | Astro SSR — upload UI, bundle view, download API, login | HTTP at `files.alamst.me` |
| `filebundle-sweep` | Deletes bundles past their `expires_at` + their R2 objects | Cron `0 * * * *` |

Resources (R2 bucket, D1 database, KV namespace) are declared as bindings in `wrangler.jsonc` and `sweep/wrangler.jsonc`. The upstream's resource ids are committed alongside; forks delete them and let [`wrangler deploy`'s auto-provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/) create the same resources on their own account. See [Fork & deploy your own](#fork--deploy-your-own).

## Updating the app

Push to `main`. That's it.

`.github/workflows/deploy.yml` runs on every push that touches `filebundle/**`, the workflow file itself, or `pnpm-lock.yaml`. It installs deps, runs unit + integration tests, applies any new D1 migrations, and deploys both Workers.

GitHub Actions secrets required on the repo:

- `CLOUDFLARE_API_TOKEN` — Workers + R2 + D1 + KV edit (+ DNS edit if using a custom domain)
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

## Fork & deploy your own

```bash
git clone <your-fork-url> && cd <your-fork>/filebundle
```

Edit `wrangler.jsonc` and `sweep/wrangler.jsonc`: delete the lines marked `// Fork:` (the `database_id`, KV `id`, and the `routes` block — or replace `routes` with your own custom domain).

```bash
pnpm install
export CLOUDFLARE_API_TOKEN=...     # Workers + R2 + D1 + KV edit (+ DNS if using a custom domain)
export CLOUDFLARE_ACCOUNT_ID=...

pnpm wrangler deploy                # auto-provisions R2 + D1 + KV by binding name on first run
pnpm wrangler d1 migrations apply filebundle --remote
pnpm wrangler deploy --config sweep/wrangler.jsonc

echo -n "your-password" | pnpm wrangler secret put UPLOAD_PASSWORD
openssl rand -hex 32    | pnpm wrangler secret put SESSION_SECRET
```

Cloudflare links the auto-provisioned resources to your worker server-side — they stay attached on every subsequent deploy without needing the ids in `wrangler.jsonc`.

For push-to-main deploys via the included GitHub Actions workflow, add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as repo secrets on your fork.

The `routes` block (custom domain) is the one thing auto-provisioning won't handle — set it to a hostname whose zone is on the same Cloudflare account, and DNS + certs are wired up automatically on first deploy.

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

Limits apply to the whole bundle, not each request: max 20 items, 500 MB per file, 500 MB total. The endpoint returns `400` if a request would push the bundle past those limits, and `404` if the bundle has expired.

## Rate limiting

`/api/login` is rate-limited to 5 requests per minute per IP. The limiter is backed by the `SESSION` KV namespace (sliding window). Exceeded requests return 429 with `Retry-After: 60`.

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
