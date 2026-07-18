import { NextRequest, NextResponse } from 'next/server';
import { db, getGame } from '@/lib/db';

// Records a share event on the K-graph (someone generated a dare link).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const ref = typeof body?.ref === 'string' ? body.ref.slice(0, 64) : '';
  if (!getGame(slug) || !ref) return NextResponse.json({ ok: false }, { status: 400 });
  db().prepare('INSERT INTO referral_edges (slug, ref, kind, session_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(slug, ref, 'share', typeof body?.sessionId === 'string' ? body.sessionId : null, Date.now());
  return NextResponse.json({ ok: true });
}
