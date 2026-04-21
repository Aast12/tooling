import { describe, it, expect, beforeEach } from "vitest";
import { createTestD1 } from "../helpers/sqlite-d1";
import { insertBundle, insertItem, getBundle } from "@/lib/db";
import { sweepExpired } from "@/lib/sweep";

function fakeBucket() {
  const objects = new Map<string, ArrayBuffer>();
  const bucket = {
    objects,
    async put(key: string, body: ArrayBuffer) {
      objects.set(key, body);
    },
    async get(key: string) {
      const body = objects.get(key);
      return body ? { body: new Response(body).body, httpMetadata: {} } : null;
    },
    async list({ prefix }: { prefix?: string; cursor?: string; limit?: number }) {
      const keys = [...objects.keys()].filter((k) => !prefix || k.startsWith(prefix));
      return { objects: keys.map((key) => ({ key })), truncated: false, cursor: null };
    },
    async delete(keys: string[] | string) {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) objects.delete(k);
    },
  };
  return bucket;
}

describe("sweepExpired", () => {
  let db: D1Database;
  let bucket: ReturnType<typeof fakeBucket>;

  beforeEach(() => {
    db = createTestD1();
    bucket = fakeBucket();
  });

  it("deletes expired bundles and their R2 objects", async () => {
    await insertBundle(db, { id: "old", createdAt: 100, expiresAt: 200 });
    await insertItem(db, {
      id: "i1",
      bundleId: "old",
      kind: "file",
      name: "a",
      size: 1,
      mime: null,
      language: null,
      content: null,
      r2Key: "bundles/old/i1",
      position: 0,
    });
    await bucket.put("bundles/old/i1", new ArrayBuffer(1));
    await insertBundle(db, { id: "fresh", createdAt: 100, expiresAt: 1000 });

    await sweepExpired(
      { DB: db, FILES: bucket as unknown as R2Bucket },
      500,
    );

    expect(await getBundle(db, "old", 0)).toBeNull();
    expect(await getBundle(db, "fresh", 500)).not.toBeNull();
    expect(bucket.objects.size).toBe(0);
  });

  it("no-op when nothing is expired", async () => {
    await insertBundle(db, { id: "fresh", createdAt: 100, expiresAt: 1000 });
    const deleted = await sweepExpired(
      { DB: db, FILES: bucket as unknown as R2Bucket },
      500,
    );
    expect(deleted).toBe(0);
    expect(await getBundle(db, "fresh", 500)).not.toBeNull();
  });
});
