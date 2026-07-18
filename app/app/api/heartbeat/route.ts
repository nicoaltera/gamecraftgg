import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readJson } from '@/lib/http';

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  if (!sessionId) return NextResponse.json({ ok: false }, { status: 400 });

  const session = db().prepare('SELECT started_at FROM plays WHERE session_id = ?').get(sessionId) as
    | { started_at: number }
    | undefined;
  if (!session) return NextResponse.json({ ok: false }, { status: 404 });

  const now = Date.now();
  const rawRuns = Number.isFinite(body?.runs) ? Math.floor(body!.runs as number) : 0;
  // Bound reported runs against elapsed time (a game can't legitimately end more
  // than ~2 runs/sec); stops a self-reporting game inflating its feed heat.
  const maxPlausibleRuns = Math.max(1, Math.floor((now - session.started_at) / 500));
  const runs = Math.max(0, Math.min(rawRuns, maxPlausibleRuns));
  const best = Number.isFinite(body?.bestScore) ? Math.floor(body!.bestScore as number) : null;

  db().prepare(
    `UPDATE plays SET last_seen_at = ?, duration_ms = MAX(0, ? - started_at), runs = MAX(runs, ?),
       best_score = COALESCE(MAX(best_score, ?), best_score, ?)
     WHERE session_id = ?`
  ).run(now, now, runs, best, best, sessionId);
  return NextResponse.json({ ok: true });
}
