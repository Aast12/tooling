import { describe, it, expect } from "vitest";
import { EXPIRATION_CHOICES, expirationToSeconds, isValidExpiration } from "@/lib/expiration";

describe("expiration", () => {
  it("maps every choice to seconds", () => {
    expect(expirationToSeconds("1h")).toBe(3600);
    expect(expirationToSeconds("6h")).toBe(21600);
    expect(expirationToSeconds("24h")).toBe(86400);
    expect(expirationToSeconds("7d")).toBe(604800);
  });

  it("validates known choices", () => {
    for (const c of EXPIRATION_CHOICES) expect(isValidExpiration(c)).toBe(true);
  });

  it("rejects unknown", () => {
    expect(isValidExpiration("30d")).toBe(false);
    expect(isValidExpiration("")).toBe(false);
    expect(isValidExpiration("abc")).toBe(false);
  });
});
