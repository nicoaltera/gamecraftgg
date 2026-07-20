import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db, getGameAny } from '@/lib/db';
import { readJson } from '@/lib/http';

// A play session is minted when a game page loads. Score submits require a
// live session — the cheapest honest layer of the accept-cheating-v1 posture.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const slug = typeof body?.slug === 'string' ? body.slug : null;
  if (!slug || !getGameAny(slug)) return NextResponse.json({ error: 'unknown game' }, { status: 404 });

  const sessionId = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const ref = typeof body?.ref === 'string' ? body.ref.slice(0, 64) : null;
  db().prepare(
    'INSERT INTO plays (slug, session_id, ref, started_at, last_seen_at, is_mobile) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(slug, sessionId, ref, now, now, body?.isMobile ? 1 : 0);
  if (ref) {
    db().prepare('INSERT INTO referral_edges (slug, ref, kind, session_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(slug, ref, 'play', sessionId, now);
  }
  return NextResponse.json({ sessionId });
}
