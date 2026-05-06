import { isValidExpiration, type Expiration } from "@/lib/expiration";

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
export const MAX_SNIPPET_BYTES = 1 * 1024 * 1024;
export const MAX_ITEMS = 20;

export interface SnippetInput {
  content: string;
  name?: string;
  language?: string;
}

export interface UploadInput {
  files: File[];
  snippets: SnippetInput[];
  expiration: string;
}

export type ValidateResult =
  | { ok: true; expiration: Expiration }
  | { ok: false; error: string };

export type AppendResult = { ok: true } | { ok: false; error: string };

export interface AppendInput {
  files: File[];
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
      return { ok: false, error: `File ${f.name} exceeds ${MAX_FILE_BYTES} bytes` };
    }
    sum += f.size;
  }
  if (sum > MAX_TOTAL_BYTES) {
    return { ok: false, error: `Bundle total would exceed ${MAX_TOTAL_BYTES} bytes` };
  }
  for (const s of input.snippets) {
    const size = new TextEncoder().encode(s.content).length;
    if (size > MAX_SNIPPET_BYTES) {
      return { ok: false, error: `Snippet exceeds ${MAX_SNIPPET_BYTES} bytes` };
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
      return { ok: false, error: `File ${f.name} exceeds ${MAX_FILE_BYTES} bytes` };
    }
    sum += f.size;
  }
  if (sum > MAX_TOTAL_BYTES) {
    return { ok: false, error: `Total file size ${sum} exceeds ${MAX_TOTAL_BYTES}` };
  }
  for (const s of input.snippets) {
    const size = new TextEncoder().encode(s.content).length;
    if (size > MAX_SNIPPET_BYTES) {
      return { ok: false, error: `Snippet exceeds ${MAX_SNIPPET_BYTES} bytes` };
    }
  }
  return { ok: true, expiration: input.expiration };
}
