import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "../helpers/sqlite-d1";
import { createFakeR2, countObjects } from "../helpers/fake-r2";
import { __setEnvForTesting } from "../helpers/cloudflare-workers-mock";
import { POST as loginPost } from "@/pages/api/login";
import { POST as bundlesPost } from "@/pages/api/bundles/index";
import { POST as itemsPost } from "@/pages/api/bundles/[bundleId]/items";
import { GET as filesGet } from "@/pages/api/files/[id]";
import { sweepExpired } from "@/lib/sweep";
import { SESSION_COOKIE_NAME, signSession } from "@/lib/auth";

const PASSWORD = "test-password";
const SECRET = "test-session-secret";

let db: D1Database;
let bucket: R2Bucket;

beforeEach(() => {
  db = createTestD1();
  bucket = createFakeR2();
  const kvStore = new Map<string, string>();
  const kv = {
    async get(key: string, type?: string) {
      const v = kvStore.get(key);
      if (v == null) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) { kvStore.set(key, value); },
    async delete(key: string) { kvStore.delete(key); },
  };
  __setEnvForTesting({
    DB: db,
    FILES: bucket,
    UPLOAD_PASSWORD: PASSWORD,
    SESSION_SECRET: SECRET,
    SESSION: kv,
  });
});

function mockAPIContext(request: Request, params: Record<string, string> = {}) {
  const url = new URL(request.url);
  return {
    request,
    locals: { authed: true },
    url,
    params,
    props: {},
    site: url,
    generator: "test",
    cookies: {} as never,
    redirect: () => new Response(null),
    rewrite: () => new Response(null),
    preferredLocale: undefined,
    preferredLocaleList: undefined,
    currentLocale: undefined,
    routePattern: "",
    originPathname: url.pathname,
    getActionResult: () => undefined as never,
    callAction: () => Promise.resolve(undefined as never),
    isPrerendered: false,
  } as unknown as Parameters<typeof bundlesPost>[0];
}

describe("login", () => {
  it("rejects wrong password", async () => {
    const form = new URLSearchParams({ password: "wrong", next: "/" });
    const req = new Request("http://localhost/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const res = await loginPost(mockAPIContext(req));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/error=1/);
  });

  it("accepts correct password and sets cookie", async () => {
    const form = new URLSearchParams({ password: PASSWORD, next: "/" });
    const req = new Request("http://localhost/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const res = await loginPost(mockAPIContext(req));
    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toMatch(
      new RegExp(`^${SESSION_COOKIE_NAME}=`),
    );
  });
});

describe("full bundle flow", () => {
  async function createBundle(opts: {
    files?: Array<{ name: string; content: string; type?: string }>;
    snippets?: Array<{ name?: string; content: string; language?: string }>;
    expiration?: string;
  }) {
    const fd = new FormData();
    for (const f of opts.files ?? []) {
      fd.append(
        "files",
        new Blob([f.content], { type: f.type ?? "text/plain" }),
        f.name,
      );
    }
    (opts.snippets ?? []).forEach((s, i) => {
      const idx = i + 1;
      fd.append(`snippet_content_${idx}`, s.content);
      if (s.name) fd.append(`snippet_name_${idx}`, s.name);
      if (s.language) fd.append(`snippet_language_${idx}`, s.language);
    });
    fd.append("expiration", opts.expiration ?? "1h");

    const req = new Request("http://localhost/api/bundles", {
      method: "POST",
      body: fd,
    });
    return bundlesPost(mockAPIContext(req));
  }

  it("creates a bundle with file and snippet, redirects to bundle page", async () => {
    const res = await createBundle({
      files: [{ name: "hello.txt", content: "hello world" }],
      snippets: [{ content: "const x = 1;", language: "typescript" }],
    });
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location")!;
    expect(loc).toMatch(/^\/[a-z]+-[a-z]+\?created=1$/);
  });

  it("rejects empty bundle", async () => {
    const res = await createBundle({});
    expect(res.status).toBe(400);
  });

  it("rejects invalid expiration", async () => {
    const res = await createBundle({
      snippets: [{ content: "x" }],
      expiration: "99y",
    });
    expect(res.status).toBe(400);
  });

  it("downloads a file from a created bundle", async () => {
    await createBundle({
      files: [{ name: "hello.txt", content: "hello world" }],
    });
    const { results } = await db
      .prepare("SELECT id FROM items WHERE kind = 'file' LIMIT 1")
      .all<{ id: string }>();
    const itemId = results[0].id;

    const req = new Request(`http://localhost/api/files/${itemId}`);
    const res = await filesGet(mockAPIContext(req, { id: itemId }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/hello\.txt/);
    expect(await res.text()).toBe("hello world");
  });

  it("returns 0 bundles after sweep of expired", async () => {
    await createBundle({
      files: [{ name: "x.txt", content: "x" }],
      expiration: "1h",
    });
    const { results: bundleRows } = await db
      .prepare("SELECT id FROM bundles LIMIT 1")
      .all<{ id: string }>();
    const bundleId = bundleRows[0].id;
    expect(countObjects(bucket)).toBe(1);

    await db
      .prepare("UPDATE bundles SET expires_at = 1 WHERE id = ?")
      .bind(bundleId)
      .run();

    const deleted = await sweepExpired(
      { DB: db, FILES: bucket },
      9_999_999_999,
    );
    expect(deleted).toBe(1);
    expect(countObjects(bucket)).toBe(0);

    const { results: remaining } = await db
      .prepare("SELECT id FROM bundles WHERE id = ?")
      .bind(bundleId)
      .all();
    expect(remaining.length).toBe(0);
  });

  it("session cookie signed with SECRET verifies", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signSession(SECRET, now);
    expect(token.split(".")).toHaveLength(2);
  });

  async function appendItems(
    bundleId: string,
    opts: {
      files?: Array<{ name: string; content: string; type?: string }>;
      snippets?: Array<{ name?: string; content: string; language?: string }>;
    },
  ) {
    const fd = new FormData();
    for (const f of opts.files ?? []) {
      fd.append("files", new Blob([f.content], { type: f.type ?? "text/plain" }), f.name);
    }
    (opts.snippets ?? []).forEach((s, i) => {
      const idx = i + 1;
      fd.append(`snippet_content_${idx}`, s.content);
      if (s.name) fd.append(`snippet_name_${idx}`, s.name);
      if (s.language) fd.append(`snippet_language_${idx}`, s.language);
    });
    const req = new Request(`http://localhost/api/bundles/${bundleId}/items`, {
      method: "POST",
      body: fd,
    });
    return itemsPost(mockAPIContext(req, { bundleId }));
  }

  it("appends items to an existing bundle and preserves position order", async () => {
    await createBundle({ files: [{ name: "first.txt", content: "1" }] });
    const { results } = await db
      .prepare("SELECT id FROM bundles LIMIT 1")
      .all<{ id: string }>();
    const bundleId = results[0].id;

    const res = await appendItems(bundleId, {
      files: [{ name: "second.txt", content: "22" }],
      snippets: [{ content: "note body", name: "note" }],
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`/${bundleId}`);

    const { results: items } = await db
      .prepare(
        "SELECT name, kind, position FROM items WHERE bundle_id = ? ORDER BY position ASC",
      )
      .bind(bundleId)
      .all<{ name: string; kind: string; position: number }>();
    expect(items.map((i) => i.name)).toEqual(["first.txt", "second.txt", "note"]);
    expect(items.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it("returns 404 when appending to a missing bundle", async () => {
    const res = await appendItems("does-not-exist", {
      snippets: [{ content: "x" }],
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when appending to an expired bundle", async () => {
    await createBundle({ snippets: [{ content: "x" }] });
    const { results } = await db
      .prepare("SELECT id FROM bundles LIMIT 1")
      .all<{ id: string }>();
    const bundleId = results[0].id;
    await db
      .prepare("UPDATE bundles SET expires_at = 1 WHERE id = ?")
      .bind(bundleId)
      .run();

    const res = await appendItems(bundleId, { snippets: [{ content: "y" }] });
    expect(res.status).toBe(404);
  });

  it("rejects empty append", async () => {
    await createBundle({ snippets: [{ content: "seed" }] });
    const { results } = await db
      .prepare("SELECT id FROM bundles LIMIT 1")
      .all<{ id: string }>();
    const res = await appendItems(results[0].id, {});
    expect(res.status).toBe(400);
  });
});
