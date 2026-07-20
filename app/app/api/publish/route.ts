import { NextRequest, NextResponse } from 'next/server';
import { db, getGameAny } from '@/lib/db';
import { readJson } from '@/lib/http';

// A game only reaches the public library when its creator clicks Publish.
// Generated games start as 'draft' (owner-only); this flips it to 'published'.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const ref = typeof body?.ref === 'string' ? body.ref : '';
  const game = getGameAny(slug);
  if (!game) return NextResponse.json({ error: 'unknown game' }, { status: 404 });
  if (!ref || game.creator_ref !== ref) return NextResponse.json({ error: 'not your game' }, { status: 403 });
  if (game.status === 'published') return NextResponse.json({ ok: true, already: true });
  db().prepare("UPDATE games SET status = 'published' WHERE slug = ?").run(slug);
  return NextResponse.json({ ok: true });
}
