import { insertItem } from "@/lib/db";
import { putFile } from "@/lib/r2";
import type { SnippetInput } from "@/lib/validation";

export function collectSnippets(form: FormData): SnippetInput[] {
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

export async function writeBundleItems(
  db: D1Database,
  bucket: R2Bucket,
  bundleId: string,
  files: File[],
  snippets: SnippetInput[],
  startPosition: number,
): Promise<void> {
  let position = startPosition;
  for (const file of files) {
    const itemId = crypto.randomUUID();
    const r2Key = `bundles/${bundleId}/${itemId}`;
    await putFile(bucket, r2Key, file.stream(), file.type || null);
    await insertItem(db, {
      id: itemId,
      bundleId,
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
    await insertItem(db, {
      id: itemId,
      bundleId,
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
}
