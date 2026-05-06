import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { capturePostHog, classifyRequest, getWaitUntil } from "@/lib/analytics";

describe("classifyRequest", () => {
  it("treats normal app paths as benign", () => {
    expect(classifyRequest("/", "Mozilla/5.0").suspicious).toBe(false);
    expect(classifyRequest("/login", "Mozilla/5.0").suspicious).toBe(false);
    expect(classifyRequest("/abc123", "Mozilla/5.0").suspicious).toBe(false);
    expect(classifyRequest("/api/bundles", "curl/8.0").suspicious).toBe(false);
  });

  it("flags scanner paths", () => {
    const cases = [
      "/wp-admin",
      "/wp-admin/setup.php",
      "/.env",
      "/.env.production",
      "/.git/config",
      "/phpmyadmin/index.php",
      "/actuator/health",
      "/cgi-bin/test",
    ];
    for (const p of cases) {
      const r = classifyRequest(p, "Mozilla/5.0");
      expect(r.suspicious, `expected ${p} to be suspicious`).toBe(true);
      if (r.suspicious) expect(r.reason).toMatch(/scanner_path:/);
    }
  });

  it("does NOT flag legitimate paths that share a prefix with scanner paths", () => {
    // /admin.php is a scanner path, but /admin (with no .php) shouldn't false-positive
    // for app routes that happen to contain similar substrings.
    expect(classifyRequest("/login-help", "Mozilla/5.0").suspicious).toBe(false);
    expect(classifyRequest("/wp", "Mozilla/5.0").suspicious).toBe(false);
  });

  it("flags scanner user agents", () => {
    expect(classifyRequest("/", "sqlmap/1.7").suspicious).toBe(true);
    expect(classifyRequest("/", "Mozilla/5.0 (compatible; Nuclei - Open-source)").suspicious).toBe(true);
    expect(classifyRequest("/", "gobuster/3.6").suspicious).toBe(true);
  });

  it("flags path traversal", () => {
    expect(classifyRequest("/files/../../etc/passwd", "Mozilla/5.0")).toMatchObject({
      suspicious: true,
      reason: "path_traversal",
    });
    expect(classifyRequest("/x/%2e%2e/y", "Mozilla/5.0")).toMatchObject({
      suspicious: true,
      reason: "path_traversal",
    });
  });

  it("flags injection-y characters in the path", () => {
    expect(classifyRequest("/search?q=<script>", "Mozilla/5.0").suspicious).toBe(true);
    expect(classifyRequest("/x'union select", "Mozilla/5.0").suspicious).toBe(true);
  });
});

describe("capturePostHog", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when api key is unset", async () => {
    await capturePostHog({}, "request", "1.2.3.4", { path: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the default US host with api key + event", async () => {
    await capturePostHog({ apiKey: "phc_test" }, "request", "1.2.3.4", { path: "/" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us.i.posthog.com/capture/");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.api_key).toBe("phc_test");
    expect(body.event).toBe("request");
    expect(body.distinct_id).toBe("1.2.3.4");
    expect(body.properties.path).toBe("/");
    expect(body.properties.$lib).toBe("filebundle-worker");
  });

  it("respects a custom host and trims trailing slash", async () => {
    await capturePostHog(
      { apiKey: "k", host: "https://eu.i.posthog.com/" },
      "request",
      "ip",
      {},
    );
    expect(fetchMock.mock.calls[0][0]).toBe("https://eu.i.posthog.com/capture/");
  });

  it("swallows fetch errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(
      capturePostHog({ apiKey: "k" }, "request", "ip", {}),
    ).resolves.toBeUndefined();
  });
});

describe("getWaitUntil", () => {
  it("uses ctx.waitUntil when present", async () => {
    const spy = vi.fn();
    const wait = getWaitUntil({ runtime: { ctx: { waitUntil: spy } } });
    const p = Promise.resolve("ok");
    wait(p);
    expect(spy).toHaveBeenCalledWith(p);
  });

  it("falls back gracefully when runtime ctx is missing", async () => {
    const wait = getWaitUntil(undefined);
    expect(() => wait(Promise.resolve())).not.toThrow();
    // and rejected promises don't escape
    expect(() => wait(Promise.reject(new Error("x")))).not.toThrow();
  });
});
