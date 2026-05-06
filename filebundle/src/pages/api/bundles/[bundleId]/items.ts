import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getBundle, getBundleStats } from "@/lib/db";
import { validateAppend } from "@/lib/validation";
import { collectSnippets, writeBundleItems } from "@/lib/bundle-write";

export const POST: APIRoute = async ({ params, request }) => {
  const bundleId = params.bundleId;
  if (!bundleId) return new Response("missing bundleId", { status: 400 });

  const e = env as Env;
  const now = Math.floor(Date.now() / 1000);

  const bundle = await getBundle(e.DB, bundleId, now);
  if (!bundle) return new Response("not found", { status: 404 });

  const form = await request.formData();
  const files = form
    .getAll("files")
    .filter((v): v is File => v instanceof File && v.size > 0);
  const snippets = collectSnippets(form);

  const stats = await getBundleStats(e.DB, bundleId);
  const v = validateAppend({
    files,
    snippets,
    existingItems: stats.count,
    existingBytes: stats.totalBytes,
  });
  if (!v.ok) return new Response(v.error, { status: 400 });

  await writeBundleItems(
    e.DB,
    e.FILES,
    bundleId,
    files,
    snippets,
    stats.maxPosition + 1,
  );

  return new Response(null, {
    status: 302,
    headers: { Location: `/${bundleId}` },
  });
};
