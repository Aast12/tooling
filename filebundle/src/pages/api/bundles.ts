import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { generateUniqueSlug } from "@/lib/id";
import { expirationToSeconds, isValidExpiration } from "@/lib/expiration";
import { validateUpload, type SnippetInput } from "@/lib/validation";
import { insertItem, tryInsertBundle } from "@/lib/db";
import { putFile } from "@/lib/r2";

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

  let position = 0;
  for (const file of files) {
    const itemId = crypto.randomUUID();
    const r2Key = `bundles/${slug}/${itemId}`;
    await putFile(e.FILES, r2Key, file.stream(), file.type || null);
    await insertItem(e.DB, {
      id: itemId,
      bundleId: slug,
      kind: "file",
      name: file.name,
      size: file.size,
      mime: file.type || null,
      language: null,
      content: null,
      r2Key,
      position: position++,
    });
  }

  for (const s of snippets) {
    const itemId = crypto.randomUUID();
    const size = new TextEncoder().encode(s.content).length;
    await insertItem(e.DB, {
      id: itemId,
      bundleId: slug,
      kind: "snippet",
      name: s.name?.trim() ? s.name.trim() : `snippet-${position + 1}`,
      size,
      mime: null,
      language: s.language?.trim() || null,
      content: s.content,
      r2Key: null,
      position: position++,
    });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: `/${slug}?created=1` },
  });
};

function collectSnippets(form: FormData): SnippetInput[] {
  const indices = new Set<number>();
  for (const key of form.keys()) {
    const match = key.match(/^snippet_(content|name|language)_(\d+)$/);
    if (match) indices.add(Number(match[2]));
  }
  const snippets: SnippetInput[] = [];
  for (const i of [...indices].sort((a, b) => a - b)) {
    const content = String(form.get(`snippet_content_${i}`) ?? "");
    if (!content) continue;
    snippets.push({
      content,
      name: String(form.get(`snippet_name_${i}`) ?? "") || undefined,
      language: String(form.get(`snippet_language_${i}`) ?? "") || undefined,
    });
  }
  return snippets;
}
