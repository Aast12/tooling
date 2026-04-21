import { describe, it, expect, vi } from "vitest";
import { generateSlug, generateUniqueSlug } from "@/lib/id";
import { ADJECTIVES } from "@/words/adjectives";
import { NOUNS } from "@/words/nouns";

describe("generateSlug", () => {
  it("has shape <adjective>-<noun>", () => {
    const slug = generateSlug();
    const [adj, noun] = slug.split("-");
    expect(ADJECTIVES).toContain(adj);
    expect(NOUNS).toContain(noun);
  });

  it("uses the provided RNG deterministically", () => {
    const rng = () => 0;
    expect(generateSlug(rng)).toBe(`${ADJECTIVES[0]}-${NOUNS[0]}`);
  });

  it("word lists are exactly 200 each", () => {
    expect(ADJECTIVES.length).toBe(200);
    expect(NOUNS.length).toBe(200);
  });
});

describe("generateUniqueSlug", () => {
  it("returns the first non-colliding slug", async () => {
    const seen = new Set<string>();
    const tryInsert = vi.fn(async (slug: string) => {
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
    const slug = await generateUniqueSlug(tryInsert);
    expect(tryInsert).toHaveBeenCalledTimes(1);
    expect(slug).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("retries on collision up to 5 times then throws", async () => {
    const tryInsert = vi.fn(async () => false);
    await expect(generateUniqueSlug(tryInsert)).rejects.toThrow(/after 5/);
    expect(tryInsert).toHaveBeenCalledTimes(5);
  });

  it("succeeds on a late retry", async () => {
    let calls = 0;
    const tryInsert = vi.fn(async () => {
      calls += 1;
      return calls === 3;
    });
    const slug = await generateUniqueSlug(tryInsert);
    expect(slug).toMatch(/^[a-z]+-[a-z]+$/);
    expect(tryInsert).toHaveBeenCalledTimes(3);
  });
});
