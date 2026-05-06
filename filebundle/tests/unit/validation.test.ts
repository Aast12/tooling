import { describe, it, expect } from "vitest";
import {
  validateUpload,
  validateAppend,
  MAX_FILE_BYTES,
  MAX_ITEMS,
  MAX_SNIPPET_BYTES,
  MAX_TOTAL_BYTES,
} from "@/lib/validation";

function makeFile(name: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)]);
  return new File([blob], name, { type: "application/octet-stream" });
}

describe("validateUpload", () => {
  it("accepts a minimal valid payload", () => {
    const result = validateUpload({
      files: [makeFile("a.txt", 10)],
      snippets: [],
      expiration: "1h",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects empty payload", () => {
    const r = validateUpload({ files: [], snippets: [], expiration: "1h" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least one item/i);
  });

  it("rejects invalid expiration", () => {
    const r = validateUpload({
      files: [makeFile("a", 1)],
      snippets: [],
      expiration: "30d",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects more than MAX_ITEMS", () => {
    const files = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => makeFile(`f${i}`, 1));
    const r = validateUpload({ files, snippets: [], expiration: "1h" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/20/);
  });

  it("rejects a single file over 100MB", () => {
    const r = validateUpload({
      files: [makeFile("big", MAX_FILE_BYTES + 1)],
      snippets: [],
      expiration: "1h",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects total over 500MB", () => {
    const files = [
      makeFile("a", MAX_FILE_BYTES),
      makeFile("b", MAX_FILE_BYTES),
      makeFile("c", MAX_FILE_BYTES),
      makeFile("d", MAX_FILE_BYTES),
      makeFile("e", MAX_FILE_BYTES),
      makeFile("f", 1),
    ];
    const r = validateUpload({ files, snippets: [], expiration: "1h" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/total/i);
  });

  it("rejects a snippet over 1MB", () => {
    const r = validateUpload({
      files: [],
      snippets: [{ content: "x".repeat(MAX_SNIPPET_BYTES + 1) }],
      expiration: "1h",
    });
    expect(r.ok).toBe(false);
  });

  it("accepts files + snippets together", () => {
    const r = validateUpload({
      files: [makeFile("a.txt", 10)],
      snippets: [{ content: "hello", name: "note", language: "text" }],
      expiration: "24h",
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateAppend", () => {
  it("accepts adding to a non-full bundle", () => {
    const r = validateAppend({
      files: [makeFile("a.txt", 10)],
      snippets: [],
      existingItems: 3,
      existingBytes: 1000,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects empty append", () => {
    const r = validateAppend({
      files: [],
      snippets: [],
      existingItems: 1,
      existingBytes: 10,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least one/i);
  });

  it("rejects when total items would exceed MAX_ITEMS", () => {
    const r = validateAppend({
      files: [makeFile("a", 1), makeFile("b", 1)],
      snippets: [],
      existingItems: MAX_ITEMS - 1,
      existingBytes: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exceed/i);
  });

  it("rejects when total bytes would exceed MAX_TOTAL_BYTES", () => {
    const r = validateAppend({
      files: [makeFile("big", 100)],
      snippets: [],
      existingItems: 1,
      existingBytes: MAX_TOTAL_BYTES - 50,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/total/i);
  });

  it("rejects a single oversized file", () => {
    const r = validateAppend({
      files: [makeFile("huge", MAX_FILE_BYTES + 1)],
      snippets: [],
      existingItems: 0,
      existingBytes: 0,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an oversized snippet", () => {
    const r = validateAppend({
      files: [],
      snippets: [{ content: "x".repeat(MAX_SNIPPET_BYTES + 1) }],
      existingItems: 0,
      existingBytes: 0,
    });
    expect(r.ok).toBe(false);
  });
});
