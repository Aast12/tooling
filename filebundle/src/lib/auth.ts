export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_COOKIE_NAME = "files_session";

const encoder = new TextEncoder();

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signSession(secret: string, issuedAt: number): Promise<string> {
  const mac = await hmacSha256(secret, `authed:${issuedAt}`);
  return `${mac}.${issuedAt}`;
}

export type VerifyResult =
  | { valid: true; issuedAt: number }
  | { valid: false };

export async function verifySession(
  secret: string,
  token: string,
  now: number,
): Promise<VerifyResult> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return { valid: false };
  const mac = token.slice(0, dot);
  const issuedStr = token.slice(dot + 1);
  const issuedAt = Number.parseInt(issuedStr, 10);
  if (!Number.isFinite(issuedAt)) return { valid: false };
  if (now - issuedAt > SESSION_MAX_AGE_SECONDS) return { valid: false };
  const expected = await hmacSha256(secret, `authed:${issuedAt}`);
  if (!timingSafeEqual(mac, expected)) return { valid: false };
  return { valid: true, issuedAt };
}

export function passwordMatches(submitted: string, expected: string): boolean {
  return timingSafeEqual(submitted, expected);
}

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}
