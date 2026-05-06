import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { passwordMatches, sessionCookieHeader, signSession } from "@/lib/auth";
import { checkAndIncrement } from "@/lib/ratelimit";
import { capturePostHog, getWaitUntil } from "@/lib/analytics";

export const POST: APIRoute = async ({ request, locals }) => {
  const e = env as Env;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const userAgent = request.headers.get("User-Agent") ?? "";
  const waitUntil = getWaitUntil(locals);
  const fire = (event: string, extra: Record<string, unknown> = {}) => {
    if (!e.POSTHOG_API_KEY) return;
    waitUntil(
      capturePostHog(
        { apiKey: e.POSTHOG_API_KEY, host: e.POSTHOG_HOST },
        event,
        ip,
        {
          ip,
          user_agent: userAgent,
          country: cf?.country ?? null,
          asn: cf?.asn ?? null,
          asn_org: cf?.asOrganization ?? null,
          ...extra,
        },
      ),
    );
  };

  const rl = await checkAndIncrement({
    kv: e.SESSION,
    key: `login:${ip}`,
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    fire("login_rate_limited", { retry_after: rl.retryAfterSeconds });
    return new Response("Too many login attempts. Try again in a minute.", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");

  if (!passwordMatches(password, e.UPLOAD_PASSWORD)) {
    fire("login_failure", { next });
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/login?error=1&next=${encodeURIComponent(next)}`,
      },
    });
  }

  const token = await signSession(e.SESSION_SECRET, Math.floor(Date.now() / 1000));
  const safeNext = next.startsWith("/") ? next : "/";
  fire("login_success", { next: safeNext });
  return new Response(null, {
    status: 302,
    headers: {
      Location: safeNext,
      "Set-Cookie": sessionCookieHeader(token),
    },
  });
};
