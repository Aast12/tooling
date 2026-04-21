import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export const onRequest = defineMiddleware(async (ctx, next) => {
  const url = new URL(ctx.request.url);
  const pathname = url.pathname;

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/_astro/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt"
  ) {
    ctx.locals.authed = false;
    return next();
  }

  const secret = (env as Env).SESSION_SECRET;
  if (!secret) {
    return new Response("Server misconfiguration: SESSION_SECRET not set", { status: 500 });
  }

  const cookieHeader = ctx.request.headers.get("Cookie") ?? "";
  const token = parseCookie(cookieHeader, SESSION_COOKIE_NAME);
  const now = Math.floor(Date.now() / 1000);
  const result = token
    ? await verifySession(secret, token, now)
    : { valid: false as const };

  if (!result.valid) {
    const nextPath = encodeURIComponent(pathname + url.search);
    return new Response(null, {
      status: 302,
      headers: { Location: `/login?next=${nextPath}` },
    });
  }

  ctx.locals.authed = true;
  return next();
});

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return v ?? null;
  }
  return null;
}
