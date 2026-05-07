import { isValidExpiration, type Expiration } from "@/lib/expiration";

export const MAX_FILE_BYTES = 500 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
export const MAX_SNIPPET_BYTES = 1 * 1024 * 1024;
export const MAX_ITEMS = 20;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export interface SnippetInput {
  content: string;
  name?: string;
  language?: string;
}

export interface FileMeta {
  name: string;
  size: number;
  type?: string;
}

export interface UploadInput {
  files: FileMeta[];
  snippets: SnippetInput[];
  expiration: string;
}

export type ValidateResult =
  | { ok: true; expiration: Expiration }
  | { ok: false; error: string };

export type AppendResult = { ok: true } | { ok: false; error: string };

export interface AppendInput {
  files: FileMeta[];
  snippets: SnippetInput[];
  existingItems: number;
  existingBytes: number;
}

export function validateAppend(input: AppendInput): AppendResult {
  const incoming = input.files.length + input.snippets.length;
  if (incoming === 0) {
    return { ok: false, error: "Must add at least one item" };
  }
  if (input.existingItems + incoming > MAX_ITEMS) {
    return {
      ok: false,
      error: `Bundle would exceed ${MAX_ITEMS} items (has ${input.existingItems}, adding ${incoming})`,
    };
  }
  let sum = input.existingBytes;
  for (const f of input.files) {
    if (f.size > MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `File "${f.name}" (${formatBytes(f.size)}) exceeds the ${formatBytes(MAX_FILE_BYTES)} per-file limit`,
      };
    }
    sum += f.size;
  }
  if (sum > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Bundle total (${formatBytes(sum)}) would exceed the ${formatBytes(MAX_TOTAL_BYTES)} bundle limit`,
    };
  }
  for (const s of input.snippets) {
    const size = new TextEncoder().encode(s.content).length;
    if (size > MAX_SNIPPET_BYTES) {
      return {
        ok: false,
        error: `Snippet (${formatBytes(size)}) exceeds the ${formatBytes(MAX_SNIPPET_BYTES)} snippet limit`,
      };
    }
  }
  return { ok: true };
}

export function validateUpload(input: UploadInput): ValidateResult {
  if (!isValidExpiration(input.expiration)) {
    return { ok: false, error: `Invalid expiration: ${input.expiration}` };
  }
  const total = input.files.length + input.snippets.length;
  if (total === 0) {
    return { ok: false, error: "Bundle must contain at least one item" };
  }
  if (total > MAX_ITEMS) {
    return { ok: false, error: `Bundle exceeds ${MAX_ITEMS} items (got ${total})` };
  }
  let sum = 0;
  for (const f of input.files) {
    if (f.size > MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `File "${f.name}" (${formatBytes(f.size)}) exceeds the ${formatBytes(MAX_FILE_BYTES)} per-file limit`,
      };
    }
    sum += f.size;
  }
  if (sum > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Total file size (${formatBytes(sum)}) exceeds the ${formatBytes(MAX_TOTAL_BYTES)} bundle limit`,
    };
  }
  for (const s of input.snippets) {
    const size = new TextEncoder().encode(s.content).length;
    if (size > MAX_SNIPPET_BYTES) {
      return {
        ok: false,
        error: `Snippet (${formatBytes(size)}) exceeds the ${formatBytes(MAX_SNIPPET_BYTES)} snippet limit`,
      };
    }
  }
  return { ok: true, expiration: input.expiration };
}
