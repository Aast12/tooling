import { describe, it, expect, beforeEach } from "vitest";
import { createTestD1 } from "../helpers/sqlite-d1";
import {
  insertBundle,
  insertItem,
  getBundle,
  getBundleItems,
  deleteBundle,
  listExpiredBundleIds,
  tryInsertBundle,
} from "@/lib/db";

let db: D1Database;

beforeEach(() => {
  db = createTestD1();
});

describe("db", () => {
  it("inserts and reads a bundle", async () => {
    await insertBundle(db, { id: "red-flower", createdAt: 100, expiresAt: 200 });
    const b = await getBundle(db, "red-flower", 100);
    expect(b).toEqual({ id: "red-flower", created_at: 100, expires_at: 200 });
  });

  it("returns null for expired bundle when now >= expiresAt", async () => {
    await insertBundle(db, { id: "red-flower", createdAt: 100, expiresAt: 200 });
    const b = await getBundle(db, "red-flower", 200);
    expect(b).toBeNull();
  });

  it("inserts and reads items in position order", async () => {
    await insertBundle(db, { id: "red-flower", createdAt: 100, expiresAt: 200 });
    await insertItem(db, { id: "i2", bundleId: "red-flower", kind: "file", name: "b", size: 2, mime: null, language: null, content: null, r2Key: "k2", position: 1 });
    await insertItem(db, { id: "i1", bundleId: "red-flower", kind: "snippet", name: "a", size: 5, mime: null, language: "ts", content: "x = 1", r2Key: null, position: 0 });
    const items = await getBundleItems(db, "red-flower");
    expect(items.map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("deleteBundle cascades to items", async () => {
    await insertBundle(db, { id: "red-flower", createdAt: 100, expiresAt: 200 });
    await insertItem(db, { id: "i1", bundleId: "red-flower", kind: "file", name: "a", size: 1, mime: null, language: null, content: null, r2Key: "k1", position: 0 });
    await deleteBundle(db, "red-flower");
    expect(await getBundleItems(db, "red-flower")).toEqual([]);
  });

  it("listExpiredBundleIds returns ids past expiry", async () => {
    await insertBundle(db, { id: "a", createdAt: 100, expiresAt: 200 });
    await insertBundle(db, { id: "b", createdAt: 100, expiresAt: 300 });
    await insertBundle(db, { id: "c", createdAt: 100, expiresAt: 400 });
    const expired = await listExpiredBundleIds(db, 350, 10);
    expect(expired.sort()).toEqual(["a", "b"]);
  });

  it("tryInsertBundle returns true on first insert, false on collision", async () => {
    const ok1 = await tryInsertBundle(db, { id: "x", createdAt: 1, expiresAt: 2 });
    const ok2 = await tryInsertBundle(db, { id: "x", createdAt: 1, expiresAt: 2 });
    expect(ok1).toBe(true);
    expect(ok2).toBe(false);
  });
});
