import crypto from 'node:crypto';

// Per-job worker credentials: token = HMAC(genId). A worker holds exactly one
// token and can therefore only report on its own build — it can't see or touch
// any other job, and it never holds an app-wide secret. Rotating
// GC_INTERNAL_SECRET revokes every outstanding token at once.
function secret(): string {
  const s = process.env.GC_INTERNAL_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error('GC_INTERNAL_SECRET (or BETTER_AUTH_SECRET) must be set');
  return s;
}

export function jobToken(genId: string): string {
  return crypto.createHmac('sha256', secret()).update(`build:${genId}`).digest('hex');
}

export function verifyJobToken(genId: string, token: string | null): boolean {
  if (!token) return false;
  const expected = jobToken(genId);
  return safeEqual(token, expected);
}

// Draft-play tokens: unpublished games are owner-only, but the game iframe
// loads from the separate game origin where the app's session cookie does not
// exist. The game page mints a short-lived signed token for the owner and the
// play route verifies it — capability, not identity, scoped to one slug.
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

export function draftToken(slug: string, ttlMs = DRAFT_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const sig = crypto.createHmac('sha256', secret()).update(`draft:${slug}:${exp}`).digest('hex');
  return `${exp}.${sig}`;
}

export function verifyDraftToken(slug: string, token: string | null): boolean {
  if (!token) return false;
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false;
  const expected = crypto.createHmac('sha256', secret()).update(`draft:${slug}:${exp}`).digest('hex');
  return safeEqual(sig, expected);
}

function safeEqual(a: string, b: string): boolean {
  try {
    return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
