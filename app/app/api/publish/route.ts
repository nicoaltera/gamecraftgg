import { NextRequest, NextResponse } from 'next/server';
import { db, getGameAny } from '@/lib/db';
import { auth } from '@/lib/auth';
import { readJson } from '@/lib/http';

// A game only reaches the public library when its creator clicks Publish.
// Ownership = the session user. (Legacy anonymous 8-hex refs are accepted
// ONLY for pre-auth drafts that were never adopted; user ids never match the
// 8-hex shape, so a leaked ref can't publish an account's games.)
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const ref = typeof body?.ref === 'string' ? body.ref : '';
  const game = getGameAny(slug);
  if (!game) return NextResponse.json({ error: 'unknown game' }, { status: 404 });

  const session = await auth.api.getSession({ headers: req.headers });
  const ownsAsUser = !!session && !!game.creator_ref && game.creator_ref === session.user.id;
  const ownsAsLegacyRef = /^[0-9a-f]{8}$/.test(ref) && game.creator_ref === ref;
  if (!ownsAsUser && !ownsAsLegacyRef) return NextResponse.json({ error: 'not your game' }, { status: 403 });

  if (game.status === 'published') return NextResponse.json({ ok: true, already: true });
  db().prepare("UPDATE games SET status = 'published' WHERE slug = ?").run(slug);
  return NextResponse.json({ ok: true });
}
