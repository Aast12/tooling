// Simple KV-backed sliding-window rate limiter. Not perfectly atomic (two
// concurrent requests could both read count=N and both write count=N+1), but
// good enough for login brute-force throttling — worst case we allow a few
// extra attempts before the cap, never the other way around.

export interface RateLimitOptions {
  kv: KVNamespace;
  key: string;
  limit: number;
  windowSeconds: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

interface Bucket {
  count: number;
  expiresAt: number;
}

export async function checkAndIncrement(opts: RateLimitOptions): Promise<RateLimitResult> {
  const namespaced = `ratelimit:${opts.key}`;
  const now = Date.now();
  const current = await opts.kv.get<Bucket>(namespaced, "json");

  if (current && current.expiresAt > now) {
    if (current.count >= opts.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)),
      };
    }
    await opts.kv.put(
      namespaced,
      JSON.stringify({ count: current.count + 1, expiresAt: current.expiresAt }),
      { expirationTtl: opts.windowSeconds * 2 },
    );
    return { allowed: true };
  }

  await opts.kv.put(
    namespaced,
    JSON.stringify({ count: 1, expiresAt: now + opts.windowSeconds * 1000 }),
    { expirationTtl: opts.windowSeconds * 2 },
  );
  return { allowed: true };
}
