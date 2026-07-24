import { NextRequest, NextResponse } from 'next/server';
import { db, getGame } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { readJson } from '@/lib/http';

// Records a share event on the K-graph (someone generated a dare link).
// Per-IP limited: shares feed the K metric, which must not be fakeable cheaply.
export async function POST(req: NextRequest) {
  if (!rateLimit(`share:${clientIp(req.headers)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }
  const body = await readJson(req);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const ref = typeof body?.ref === 'string' ? body.ref.slice(0, 64) : '';
  if (!getGame(slug) || !ref) return NextResponse.json({ ok: false }, { status: 400 });
  db().prepare('INSERT INTO referral_edges (slug, ref, kind, session_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(slug, ref, 'share', typeof body?.sessionId === 'string' ? body.sessionId : null, Date.now());
  return NextResponse.json({ ok: true });
}
