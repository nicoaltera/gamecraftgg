import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db, getGame } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { readJson } from '@/lib/http';

// Auto-unlist requires UNLIST_THRESHOLD reports from DISTINCT IPs whose
// sessions actually played the game for 20s+. Sessions alone are free to mint,
// so they can't be the counting unit — one person with curl must not be able
// to unlist a rival's game. IPs are stored as salted hashes (we count them,
// we don't keep them).
const UNLIST_THRESHOLD = 5;

function ipHash(ip: string): string {
  const salt = process.env.GC_INTERNAL_SECRET || process.env.BETTER_AUTH_SECRET || '';
  return crypto.createHash('sha256').update(`report:${salt}:${ip}`).digest('hex').slice(0, 24);
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`report:${ip}`, 10, 3600_000)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }
  const body = await readJson(req);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  if (!getGame(slug)) return NextResponse.json({ error: 'unknown game' }, { status: 404 });

  const session = db().prepare('SELECT started_at FROM plays WHERE session_id = ? AND slug = ?').get(sessionId, slug) as
    | { started_at: number }
    | undefined;
  if (!session) return NextResponse.json({ error: 'play it before reporting it' }, { status: 403 });
  // a report only counts from a session that actually spent time in the game
  if (Date.now() - session.started_at < 20_000) return NextResponse.json({ error: 'play it a bit first' }, { status: 403 });

  const hash = ipHash(ip);
  const already = db().prepare('SELECT 1 FROM reports WHERE slug = ? AND (session_id = ? OR ip = ?)').get(slug, sessionId, hash);
  if (already) return NextResponse.json({ ok: true, deduped: true });

  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 300) : '';
  db().prepare('INSERT INTO reports (slug, session_id, ip, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(slug, sessionId, hash, reason, Date.now());

  const distinct = (db().prepare('SELECT COUNT(DISTINCT ip) AS c FROM reports WHERE slug = ? AND ip IS NOT NULL').get(slug) as { c: number }).c;
  if (distinct >= UNLIST_THRESHOLD) {
    db().prepare("UPDATE games SET status = 'unlisted' WHERE slug = ?").run(slug);
  }
  return NextResponse.json({ ok: true });
}
