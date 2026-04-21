import { describe, it, expect } from "vitest";
import { signSession, verifySession, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

const SECRET = "test-secret-not-in-prod";

describe("signSession / verifySession", () => {
  it("round-trips a valid token", async () => {
    const now = 1_700_000_000;
    const token = await signSession(SECRET, now);
    const result = await verifySession(SECRET, token, now);
    expect(result).toEqual({ valid: true, issuedAt: now });
  });

  it("rejects a token signed with a different secret", async () => {
    const now = 1_700_000_000;
    const token = await signSession("wrong-secret", now);
    const result = await verifySession(SECRET, token, now);
    expect(result.valid).toBe(false);
  });

  it("rejects a token whose issuedAt was tampered with", async () => {
    const now = 1_700_000_000;
    const token = await signSession(SECRET, now);
    const [mac] = token.split(".");
    const tampered = `${mac}.${now + 999}`;
    const result = await verifySession(SECRET, tampered, now);
    expect(result.valid).toBe(false);
  });

  it("rejects an expired token", async () => {
    const issuedAt = 1_700_000_000;
    const now = issuedAt + SESSION_MAX_AGE_SECONDS + 1;
    const token = await signSession(SECRET, issuedAt);
    const result = await verifySession(SECRET, token, now);
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed token", async () => {
    const result = await verifySession(SECRET, "not-a-token", 1_700_000_000);
    expect(result.valid).toBe(false);
  });
});
