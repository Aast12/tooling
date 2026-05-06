import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { generateUniqueSlug } from "@/lib/id";
import { expirationToSeconds, isValidExpiration } from "@/lib/expiration";
import { validateUpload } from "@/lib/validation";
import { tryInsertBundle } from "@/lib/db";
import { collectSnippets, writeBundleItems } from "@/lib/bundle-write";

export const POST: APIRoute = async ({ request }) => {
  const e = env as Env;
  const form = await request.formData();

  const files = form
    .getAll("files")
    .filter((v): v is File => v instanceof File && v.size > 0);
  const snippets = collectSnippets(form);
  const expiration = String(form.get("expiration") ?? "1h");

  const v = validateUpload({ files, snippets, expiration });
  if (!v.ok) return new Response(v.error, { status: 400 });
  if (!isValidExpiration(expiration)) {
    return new Response("bad expiration", { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + expirationToSeconds(expiration);

  const slug = await generateUniqueSlug((candidate) =>
    tryInsertBundle(e.DB, { id: candidate, createdAt: now, expiresAt }),
  );

  await writeBundleItems(e.DB, e.FILES, slug, files, snippets, 0);

  return new Response(null, {
    status: 302,
    headers: { Location: `/${slug}?created=1` },
  });
};
