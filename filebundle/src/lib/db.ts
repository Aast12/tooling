export interface BundleRow {
  id: string;
  created_at: number;
  expires_at: number;
}

export interface ItemRow {
  id: string;
  bundle_id: string;
  kind: "file" | "snippet";
  name: string;
  size: number;
  mime: string | null;
  language: string | null;
  content: string | null;
  r2_key: string | null;
  position: number;
}

export interface InsertBundle {
  id: string;
  createdAt: number;
  expiresAt: number;
}

export interface InsertItem {
  id: string;
  bundleId: string;
  kind: "file" | "snippet";
  name: string;
  size: number;
  mime: string | null;
  language: string | null;
  content: string | null;
  r2Key: string | null;
  position: number;
}

export async function insertBundle(db: D1Database, b: InsertBundle): Promise<void> {
  await db
    .prepare("INSERT INTO bundles (id, created_at, expires_at) VALUES (?, ?, ?)")
    .bind(b.id, b.createdAt, b.expiresAt)
    .run();
}

export async function tryInsertBundle(db: D1Database, b: InsertBundle): Promise<boolean> {
  try {
    await insertBundle(db, b);
    return true;
  } catch (err) {
    if (err instanceof Error && /UNIQUE|constraint/i.test(err.message)) return false;
    throw err;
  }
}

export async function insertItem(db: D1Database, i: InsertItem): Promise<void> {
  await db
    .prepare(
      `INSERT INTO items (id, bundle_id, kind, name, size, mime, language, content, r2_key, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(i.id, i.bundleId, i.kind, i.name, i.size, i.mime, i.language, i.content, i.r2Key, i.position)
    .run();
}

export async function getBundle(
  db: D1Database,
  id: string,
  now: number,
): Promise<BundleRow | null> {
  const row = await db
    .prepare("SELECT id, created_at, expires_at FROM bundles WHERE id = ? AND expires_at > ?")
    .bind(id, now)
    .first<BundleRow>();
  return row ?? null;
}

export async function getBundleItems(db: D1Database, bundleId: string): Promise<ItemRow[]> {
  const { results } = await db
    .prepare(
      "SELECT id, bundle_id, kind, name, size, mime, language, content, r2_key, position FROM items WHERE bundle_id = ? ORDER BY position ASC",
    )
    .bind(bundleId)
    .all<ItemRow>();
  return results ?? [];
}

export async function getItem(
  db: D1Database,
  id: string,
): Promise<ItemRow | null> {
  const row = await db
    .prepare(
      "SELECT id, bundle_id, kind, name, size, mime, language, content, r2_key, position FROM items WHERE id = ?",
    )
    .bind(id)
    .first<ItemRow>();
  return row ?? null;
}

export async function deleteBundle(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM bundles WHERE id = ?").bind(id).run();
}

export async function listExpiredBundleIds(
  db: D1Database,
  now: number,
  limit: number,
): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT id FROM bundles WHERE expires_at <= ? LIMIT ?")
    .bind(now, limit)
    .all<{ id: string }>();
  return (results ?? []).map((r) => r.id);
}
