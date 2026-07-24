import crypto from 'node:crypto';

// In-memory sliding-window rate limiter. Single-box deployment by design
// (PLAN.md), so process memory IS the shared state; if the app ever scales
// past one machine this moves to the DB or Redis.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  // opportunistic sweep so abandoned keys can't grow the map forever
  if (buckets.size > 20_000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k);
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

// Fly terminates TLS and sets Fly-Client-IP; X-Forwarded-For is the general
// fallback (first hop). Locally neither exists — everyone is 'local'.
export function clientIp(headers: Headers): string {
  return (
    headers.get('fly-client-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'local'
  );
}

// Salted IP hash for abuse counting (reports, share-reward dedupe): we count
// distinct people, we never store addresses.
export function ipHash(ip: string): string {
  const salt = process.env.GC_INTERNAL_SECRET || process.env.BETTER_AUTH_SECRET || '';
  return crypto.createHash('sha256').update(`ip:${salt}:${ip}`).digest('hex').slice(0, 24);
}
