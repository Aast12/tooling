import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { capturePostHog, classifyRequest, getWaitUntil } from "@/lib/analytics";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export const onRequest = defineMiddleware(async (ctx, next) => {
  const url = new URL(ctx.request.url);
  const pathname = url.pathname;

  // Static assets are high-volume and uninteresting — skip analytics entirely.
  if (pathname.startsWith("/_astro/")) {
    ctx.locals.authed = false;
    return next();
  }

  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt";

  let response: Response;
  let authed = false;
  let redirectedToLogin = false;

  if (isPublic) {
    ctx.locals.authed = false;
    response = await next();
  } else {
    const secret = (env as Env).SESSION_SECRET;
    if (!secret) {
      response = new Response("Server misconfiguration: SESSION_SECRET not set", { status: 500 });
    } else {
      const cookieHeader = ctx.request.headers.get("Cookie") ?? "";
      const token = parseCookie(cookieHeader, SESSION_COOKIE_NAME);
      const now = Math.floor(Date.now() / 1000);
      const result = token ? await verifySession(secret, token, now) : { valid: false as const };

      if (!result.valid) {
        const nextPath = encodeURIComponent(pathname + url.search);
        redirectedToLogin = true;
        response = new Response(null, {
          status: 302,
          headers: { Location: `/login?next=${nextPath}` },
        });
      } else {
        ctx.locals.authed = true;
        authed = true;
        response = await next();
      }
    }
  }

  reportRequest(ctx, response, { pathname, search: url.search, authed, redirectedToLogin });
  return response;
});

function reportRequest(
  ctx: { request: Request; locals: unknown },
  response: Response,
  meta: { pathname: string; search: string; authed: boolean; redirectedToLogin: boolean },
) {
  const e = env as Env;
  if (!e.POSTHOG_API_KEY) return;

  const req = ctx.request;
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const userAgent = req.headers.get("User-Agent") ?? "";
  const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf;
  const classification = classifyRequest(meta.pathname, userAgent);

  const event = classification.suspicious ? "probe_detected" : "request";
  const properties = {
    path: meta.pathname,
    query: meta.search,
    method: req.method,
    status: response.status,
    authed: meta.authed,
    redirected_to_login: meta.redirectedToLogin,
    user_agent: userAgent,
    referer: req.headers.get("Referer") ?? null,
    ip,
    country: cf?.country ?? null,
    city: cf?.city ?? null,
    asn: cf?.asn ?? null,
    asn_org: cf?.asOrganization ?? null,
    bot_score: cf?.botManagement?.score ?? null,
    suspicious: classification.suspicious,
    probe_reason: classification.suspicious ? classification.reason : null,
  };

  const waitUntil = getWaitUntil(ctx.locals);
  waitUntil(
    capturePostHog(
      { apiKey: e.POSTHOG_API_KEY, host: e.POSTHOG_HOST },
      event,
      ip,
      properties,
    ),
  );
}

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return v ?? null;
  }
  return null;
}
