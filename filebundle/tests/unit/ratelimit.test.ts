import { describe, it, expect, beforeEach } from "vitest";
import { checkAndIncrement } from "@/lib/ratelimit";

function fakeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const v = store.get(key);
      if (v == null) return null;
      if (type === "json") return JSON.parse(v);
      return v;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

describe("checkAndIncrement", () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = fakeKV();
  });

  it("allows the first N requests", async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = await checkAndIncrement({ kv, key: "ip1", limit: 5, windowSeconds: 60 });
      expect(r.allowed).toBe(true);
    }
  });

  it("blocks the (N+1)-th", async () => {
    for (let i = 0; i < 5; i += 1) {
      await checkAndIncrement({ kv, key: "ip1", limit: 5, windowSeconds: 60 });
    }
    const r = await checkAndIncrement({ kv, key: "ip1", limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps counters per-key independent", async () => {
    for (let i = 0; i < 5; i += 1) {
      await checkAndIncrement({ kv, key: "ip1", limit: 5, windowSeconds: 60 });
    }
    const r = await checkAndIncrement({ kv, key: "ip2", limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(true);
  });
});
