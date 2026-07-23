import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { db, getGameAny } from '@/lib/db';
import { auth } from '@/lib/auth';
import { balance, addEntry, refundForGeneration, GENERATION_COST, EDIT_COST } from '@/lib/credits';
import { dispatchBuild, dispatchMode } from '@/lib/dispatch';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { readJson } from '@/lib/http';

// Admits a build (credits debit + job row in ONE synchronous SQLite txn, so a
// double-submit can never double-debit) then dispatches it — to an ephemeral
// Fly Machine in fleet mode, or a local child otherwise. Caps are env dials:
// GC_MAX_CONCURRENT bounds parallel builds (fleet capacity / API quota),
// GC_DAILY_CAP is the global token-burn backstop.
const DAILY_CAP = Number(process.env.GC_DAILY_CAP) || 200;
const MAX_CONCURRENT = Number(process.env.GC_MAX_CONCURRENT) || 2;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: 'Sign in to make games — new accounts start with 2000 credits.', code: 'auth' }, { status: 401 });
  }
  const userId = session.user.id;

  // Per-IP cap on top of per-account limits: signup throttling caps accounts
  // per IP, this caps generation per IP, together bounding what a farm can
  // extract from one connection regardless of how many accounts it makes.
  if (!rateLimit(`gen:${clientIp(req.headers)}`, 12, 3600_000)) {
    return NextResponse.json({ error: 'Too many games from this connection — take a breather.' }, { status: 429 });
  }

  const body = await readJson(req);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 400) : '';
  const ref = typeof body?.ref === 'string' ? body.ref.slice(0, 64) : '';
  const editSlug = typeof body?.editSlug === 'string' ? body.editSlug : '';
  if (prompt.length < 8) return NextResponse.json({ error: 'Describe the game in a sentence or two.' }, { status: 400 });

  // Editing an existing game requires owning it — either as the signed-in user
  // or via the browser's anonymous ref for games made before sign-in existed
  // (those get adopted into the account on sign-in, but don't strand stragglers).
  if (editSlug) {
    const g = getGameAny(editSlug);
    if (!g) return NextResponse.json({ error: 'unknown game' }, { status: 404 });
    if (g.creator_ref !== userId && !(ref && g.creator_ref === ref)) {
      return NextResponse.json({ error: 'not your game' }, { status: 403 });
    }
  }

  if (dispatchMode() === 'local') {
    try {
      execSync('which claude', { stdio: 'ignore' });
    } catch {
      return NextResponse.json({ error: 'The game workshop is offline right now (claude CLI not found).' }, { status: 503 });
    }
  }

  // Atomic admission: cap check + one-running-job check + balance check + debit
  // + job insert in one transaction (better-sqlite3 is synchronous; no await gap).
  const id = crypto.randomBytes(8).toString('hex');
  const now = Date.now();
  const admit = db().transaction((): 'ok' | 'cap' | 'busy' | 'crowded' | 'credits' => {
    const today = (db().prepare('SELECT COUNT(*) AS c FROM generations WHERE created_at > ?').get(now - 86400_000) as { c: number }).c;
    if (today >= DAILY_CAP) return 'cap';
    // Global concurrency dial. Fleet mode: one machine per build, so this is
    // budget + API quota. Local mode: keep it low — two judges loading
    // screenshots at once is what OOM-killed a single box.
    const live = (db()
      .prepare("SELECT COUNT(*) AS c FROM generations WHERE status = 'running' AND updated_at > ?")
      .get(now - 15 * 60_000) as { c: number }).c;
    if (live >= MAX_CONCURRENT) return 'crowded';
    // One running job per account: a stuck 'running' row older than 90 min is
    // treated as dead (the pipeline hard-times-out well before that).
    const running = (db()
      .prepare("SELECT COUNT(*) AS c FROM generations WHERE user_id = ? AND status = 'running' AND updated_at > ?")
      .get(userId, now - 90 * 60_000) as { c: number }).c;
    if (running > 0) return 'busy';
    const cost = editSlug ? EDIT_COST : GENERATION_COST;
    if (balance(userId) < cost) return 'credits';
    addEntry(userId, -cost, 'debit', id);
    db().prepare('INSERT INTO generations (id, prompt, status, user_id, edit_slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, prompt, 'running', userId, editSlug, now, now);
    return 'ok';
  });
  const verdict = admit();
  if (verdict === 'cap') return NextResponse.json({ error: 'The workshop hit today’s limit. Come back tomorrow.' }, { status: 429 });
  if (verdict === 'busy') return NextResponse.json({ error: 'You already have a game cooking — let it finish first.' }, { status: 429 });
  if (verdict === 'crowded') {
    return NextResponse.json({ error: 'The workshop is at capacity right now — try again in a few minutes.' }, { status: 429 });
  }
  if (verdict === 'credits') {
    const need = editSlug ? EDIT_COST : GENERATION_COST;
    return NextResponse.json({ error: `You’re out of credits — this costs ${need}.`, code: 'credits' }, { status: 402 });
  }

  // Dispatch AFTER the money committed: if no worker can start, the user gets
  // an instant refund and an honest error instead of a stuck row.
  try {
    const d = await dispatchBuild(id);
    if (d.machine) {
      db().prepare('UPDATE generations SET worker_machine = ? WHERE id = ?').run(d.machine, id);
    }
  } catch (e) {
    console.error('[generate] dispatch failed:', e);
    db().prepare("UPDATE generations SET status = 'failed', updated_at = ? WHERE id = ?").run(Date.now(), id);
    refundForGeneration(id);
    return NextResponse.json({ error: 'The workshop couldn’t pick that up — nothing was charged. Try again in a minute.' }, { status: 503 });
  }

  return NextResponse.json({ id });
}
