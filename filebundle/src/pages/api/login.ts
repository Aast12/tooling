import type { APIRoute } from "astro";
import { passwordMatches, sessionCookieHeader, signSession } from "@/lib/auth";

export const POST: APIRoute = async ({ request, locals, url }) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const env = locals.runtime.env;

  if (!passwordMatches(password, env.UPLOAD_PASSWORD)) {
    return Response.redirect(
      `${url.origin}/login?error=1&next=${encodeURIComponent(next)}`,
      302,
    );
  }

  const token = await signSession(env.SESSION_SECRET, Math.floor(Date.now() / 1000));
  const safeNext = next.startsWith("/") ? next : "/";
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${url.origin}${safeNext}`,
      "Set-Cookie": sessionCookieHeader(token),
    },
  });
};
