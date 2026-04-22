import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { passwordMatches, sessionCookieHeader, signSession } from "@/lib/auth";

export const POST: APIRoute = async ({ request }) => {
  const e = env as Env;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const result = await e.LOGIN_LIMITER.limit({ key: ip });
  console.log("LOGIN_LIMITER result:", JSON.stringify(result), "ip:", ip);
  if (!result.success) {
    return new Response("Too many login attempts. Try again in a minute.", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");

  if (!passwordMatches(password, e.UPLOAD_PASSWORD)) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/login?error=1&next=${encodeURIComponent(next)}`,
      },
    });
  }

  const token = await signSession(e.SESSION_SECRET, Math.floor(Date.now() / 1000));
  const safeNext = next.startsWith("/") ? next : "/";
  return new Response(null, {
    status: 302,
    headers: {
      Location: safeNext,
      "Set-Cookie": sessionCookieHeader(token),
    },
  });
};
