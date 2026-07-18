import { NextRequest, NextResponse } from 'next/server';
import { db, getGame, getLeaderboard } from '@/lib/db';
import { cleanName } from '@/lib/names';

// Anti-cheat posture v1 (05-architecture.md): accept cheating, design around it.
// Requirements to land on a board: a real play session of plausible age, sane
// numbers, and outlier quarantine (visible to submitter, hidden from others).
const MAX_SCORE = 1_000_000_000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  const name = cleanName(body?.name);
  const score = Number.isFinite(body?.score) ? Math.floor(body.score) : NaN;

  const game = getGame(slug);
  if (!game) return NextResponse.json({ error: 'unknown game' }, { status: 404 });
  if (!name) return NextResponse.json({ error: 'pick a cleaner name' }, { status: 400 });
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE)
    return NextResponse.json({ error: 'bad score' }, { status: 400 });

  const session = db().prepare('SELECT * FROM plays WHERE session_id = ? AND slug = ?').get(sessionId, slug) as
    | { started_at: number; duration_ms: number }
    | undefined;
  if (!session) return NextResponse.json({ error: 'no session' }, { status: 403 });

  const now = Date.now();
  const age = now - session.started_at;
  const submits = db().prepare('SELECT COUNT(*) as c FROM scores WHERE session_id = ?').get(sessionId) as { c: number };

  let quarantined = 0;
  if (age < 8_000) quarantined = 1; // scored before anyone could have played
  if (submits.c >= 30) quarantined = 1; // submit spam
  // outlier vs the current board: >20x the best with a short session smells synthetic
  const board = getLeaderboard(slug, game.score_order, undefined);
  if (board.length >= 3) {
    const top = game.score_order === 'asc' ? board[0].score : board[0].score;
    if (game.score_order === 'desc' && score > Math.max(1000, top * 20) && age < 60_000) quarantined = 1;
    if (game.score_order === 'asc' && score < top / 20 && age < 60_000) quarantined = 1;
  }

  db().prepare('INSERT INTO scores (slug, session_id, name, score, quarantined, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(slug, sessionId, name, score, quarantined, now);

  const fresh = getLeaderboard(slug, game.score_order, undefined);
  const rank = fresh.findIndex((r) => r.name === name && r.score === score) + 1 || null;
  return NextResponse.json({ ok: true, rank, quarantined: quarantined === 1 });
}
