import { NextRequest, NextResponse } from 'next/server';
import { db, getGame, getLeaderboard } from '@/lib/db';
import { cleanName } from '@/lib/names';
import { readJson } from '@/lib/http';

// Anti-cheat posture v1 (05-architecture.md): accept cheating, design around it.
// Requirements to land on a board: a real play session of plausible age, sane
// numbers, plausibility vs session duration, and outlier quarantine (visible to
// submitter, hidden from others).
const MAX_SCORE = 1_000_000_000;
// Loose absolute plausibility ceiling: even an idle bot shouldn't clear this in
// a single short session on any of our games. Applies even on an empty board.
const PLAUSIBLE_PER_SECOND = 5000;

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  const name = cleanName(body?.name);
  const score = Number.isFinite(body?.score) ? Math.floor(body!.score as number) : NaN;

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
  // Absolute plausibility vs how long the session has actually been open —
  // applies even on a fresh/empty board, closing the "wait 8s, post 1e9" hole.
  if (score > PLAUSIBLE_PER_SECOND * Math.max(8, age / 1000)) quarantined = 1;
  // Relative outlier vs the current board (board[0] is already best in either
  // order). No age gate here: a patient cheater is still an outlier.
  const board = getLeaderboard(slug, game.score_order, undefined);
  if (board.length >= 3) {
    const best = board[0].score;
    if (game.score_order === 'desc' && score > Math.max(1000, best * 20)) quarantined = 1;
    if (game.score_order === 'asc' && best > 0 && score < best / 20) quarantined = 1;
  }

  db().prepare('INSERT INTO scores (slug, session_id, name, score, quarantined, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(slug, sessionId, name, score, quarantined, now);

  const fresh = getLeaderboard(slug, game.score_order, undefined);
  const rank = fresh.findIndex((r) => r.name === name && r.score === score) + 1 || null;
  return NextResponse.json({ ok: true, rank, quarantined: quarantined === 1 });
}
