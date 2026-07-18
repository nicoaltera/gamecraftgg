import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  if (!sessionId) return NextResponse.json({ ok: false }, { status: 400 });
  const now = Date.now();
  const runs = Number.isFinite(body?.runs) ? Math.max(0, Math.min(100000, Math.floor(body.runs))) : 0;
  const best = Number.isFinite(body?.bestScore) ? Math.floor(body.bestScore) : null;
  db().prepare(
    `UPDATE plays SET last_seen_at = ?, duration_ms = MAX(0, ? - started_at), runs = MAX(runs, ?),
       best_score = COALESCE(MAX(best_score, ?), best_score, ?)
     WHERE session_id = ?`
  ).run(now, now, runs, best, best, sessionId);
  return NextResponse.json({ ok: true });
}
