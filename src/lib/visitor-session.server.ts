// Server-side only: anonymous visitor session for per-visitor limits.
// The cookie holds an opaque random value; only its hash is ever stored.

export const VISITOR_COOKIE = "fm_vid";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function newVisitorId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashVisitorId(id: string): Promise<string> {
  const salt = process.env["VISITOR_HASH_SALT"] ?? "futureme-visitor";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${id}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reuses a well-formed cookie, otherwise issues a fresh id (never trusts other input). */
export async function resolveVisitor(
  request: Request,
): Promise<{ hash: string; setCookie: string | null }> {
  const existing = readCookie(request, VISITOR_COOKIE);
  if (existing && ID_PATTERN.test(existing)) {
    return { hash: await hashVisitorId(existing), setCookie: null };
  }
  const id = newVisitorId();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    hash: await hashVisitorId(id),
    setCookie: `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
  };
}
