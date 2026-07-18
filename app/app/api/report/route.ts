import { NextRequest, NextResponse } from 'next/server';
import { db, getGame } from '@/lib/db';

const UNLIST_THRESHOLD = 5;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  if (!getGame(slug)) return NextResponse.json({ error: 'unknown game' }, { status: 404 });
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 300) : '';
  db().prepare('INSERT INTO reports (slug, reason, created_at) VALUES (?, ?, ?)').run(slug, reason, Date.now());
  const count = (db().prepare('SELECT COUNT(*) AS c FROM reports WHERE slug = ?').get(slug) as { c: number }).c;
  if (count >= UNLIST_THRESHOLD) {
    db().prepare("UPDATE games SET status = 'unlisted' WHERE slug = ?").run(slug);
  }
  return NextResponse.json({ ok: true });
}
