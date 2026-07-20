import { NextRequest, NextResponse } from 'next/server';
import { db, getGameAny, getLeaderboard, parseBoards } from '@/lib/db';
import { cleanName } from '@/lib/names';
import { readJson } from '@/lib/http';

// Anti-cheat posture v1 (05-architecture.md): accept cheating, design around it.
// A game may submit one score per declared leaderboard in a single call
// (scores: {boardKey: value}); legacy single-board games send {score}.
const MAX_SCORE = 1_000_000_000;
const PLAUSIBLE_PER_SECOND = 5000;

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  const name = cleanName(body?.name);

  const game = getGameAny(slug);
  if (!game) return NextResponse.json({ error: 'unknown game' }, { status: 404 });
  if (!name) return NextResponse.json({ error: 'pick a cleaner name' }, { status: 400 });

  const boards = parseBoards(game);
  // normalize input into { boardKey: value }
  const submitted: Record<string, number> =
    body?.scores && typeof body.scores === 'object'
      ? (body.scores as Record<string, number>)
      : { [boards.find((b) => b.primary)!.key]: body?.score as number };

  const session = db().prepare('SELECT * FROM plays WHERE session_id = ? AND slug = ?').get(sessionId, slug) as
    | { started_at: number }
    | undefined;
  if (!session) return NextResponse.json({ error: 'no session' }, { status: 403 });

  const now = Date.now();
  const age = now - session.started_at;
  const submits = (db().prepare('SELECT COUNT(*) as c FROM scores WHERE session_id = ?').get(sessionId) as { c: number }).c;

  const ranks: Record<string, number | null> = {};
  const insert = db().prepare(
    'INSERT INTO scores (slug, board, session_id, name, score, quarantined, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  for (const board of boards) {
    if (!(board.key in submitted)) continue;
    const raw = submitted[board.key];
    const score = Number.isFinite(raw) ? Math.floor(raw as number) : NaN;
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) continue;

    let quarantined = 0;
    if (age < 8_000) quarantined = 1;
    if (submits >= 30) quarantined = 1;
    if (score > PLAUSIBLE_PER_SECOND * Math.max(8, age / 1000)) quarantined = 1;
    const cur = getLeaderboard(slug, board.order, undefined, board.key);
    if (cur.length >= 3) {
      const best = cur[0].score;
      if (board.order === 'desc' && score > Math.max(1000, best * 20)) quarantined = 1;
      if (board.order === 'asc' && best > 0 && score < best / 20) quarantined = 1;
    }
    insert.run(slug, board.key, sessionId, name, score, quarantined, now);
    // rank by NAME (the board aggregates each name to their best) — matching on the
    // just-submitted score misreports null when the player already had a better one.
    const fresh = getLeaderboard(slug, board.order, undefined, board.key);
    ranks[board.key] = quarantined ? null : fresh.findIndex((r) => r.name === name) + 1 || null;
  }

  if (Object.keys(ranks).length === 0) return NextResponse.json({ error: 'bad score' }, { status: 400 });
  return NextResponse.json({ ok: true, ranks });
}
