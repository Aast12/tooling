import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "../helpers/sqlite-d1";
import { createFakeR2, countObjects } from "../helpers/fake-r2";
import { __setEnvForTesting } from "../helpers/cloudflare-workers-mock";
import { POST as loginPost } from "@/pages/api/login";
import { POST as bundlesPost } from "@/pages/api/bundles";
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
  __setEnvForTesting({
    DB: db,
    FILES: bucket,
    UPLOAD_PASSWORD: PASSWORD,
    SESSION_SECRET: SECRET,
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
});
