import { NextRequest, NextResponse } from 'next/server';
import { db, getGame } from '@/lib/db';
import { readJson } from '@/lib/http';

// Auto-unlist only on reports from DISTINCT real play sessions, and each session
// can report a game once. This turns "5 curl calls unlist anything" into
// "5 different people who actually played it flagged it" — a defensible signal.
const UNLIST_THRESHOLD = 5;

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  if (!getGame(slug)) return NextResponse.json({ error: 'unknown game' }, { status: 404 });

  const session = db().prepare('SELECT started_at FROM plays WHERE session_id = ? AND slug = ?').get(sessionId, slug) as
    | { started_at: number }
    | undefined;
  if (!session) return NextResponse.json({ error: 'play it before reporting it' }, { status: 403 });
  // a report only counts from a session that actually spent time in the game —
  // raises the bar on the auto-unlist so it can't be driven by freshly-minted sessions
  if (Date.now() - session.started_at < 20_000) return NextResponse.json({ error: 'play it a bit first' }, { status: 403 });

  const already = db().prepare('SELECT 1 FROM reports WHERE slug = ? AND session_id = ?').get(slug, sessionId);
  if (already) return NextResponse.json({ ok: true, deduped: true });

  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 300) : '';
  db().prepare('INSERT INTO reports (slug, session_id, reason, created_at) VALUES (?, ?, ?, ?)')
    .run(slug, sessionId, reason, Date.now());

  const distinct = (db().prepare('SELECT COUNT(DISTINCT session_id) AS c FROM reports WHERE slug = ?').get(slug) as { c: number }).c;
  if (distinct >= UNLIST_THRESHOLD) {
    db().prepare("UPDATE games SET status = 'unlisted' WHERE slug = ?").run(slug);
  }
  return NextResponse.json({ ok: true });
}
