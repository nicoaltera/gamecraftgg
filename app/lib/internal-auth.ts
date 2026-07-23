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
  try {
    return token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
