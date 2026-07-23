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
