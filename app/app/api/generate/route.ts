import { NextRequest, NextResponse } from 'next/server';
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { db, getGameAny } from '@/lib/db';
import { auth } from '@/lib/auth';
import { balance, addEntry, GENERATION_COST } from '@/lib/credits';
import { readJson } from '@/lib/http';

// Spawns the generation pipeline (pipeline/run.mjs) detached; the build page
// watches the trace. Generation costs credits (the ledger debit and the job
// insert commit in ONE synchronous SQLite transaction, so a double-submit can
// never double-debit and a debit can never exist without its job). The daily
// cap remains as a global token-burn backstop above the per-user economics.
const DAILY_CAP = 100;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: 'Sign in to make games — new accounts start with 200 credits.', code: 'auth' }, { status: 401 });
  }
  const userId = session.user.id;

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

  try {
    execSync('which claude', { stdio: 'ignore' });
  } catch {
    return NextResponse.json({ error: 'The game workshop is offline right now (claude CLI not found).' }, { status: 503 });
  }

  // Atomic admission: cap check + one-running-job check + balance check + debit
  // + job insert in one transaction (better-sqlite3 is synchronous; no await gap).
  const id = crypto.randomBytes(8).toString('hex');
  const now = Date.now();
  const admit = db().transaction((): 'ok' | 'cap' | 'busy' | 'credits' => {
    const today = (db().prepare('SELECT COUNT(*) AS c FROM generations WHERE created_at > ?').get(now - 86400_000) as { c: number }).c;
    if (today >= DAILY_CAP) return 'cap';
    // One running job per account: a stuck 'running' row older than 90 min is
    // treated as dead (the pipeline hard-times-out well before that).
    const running = (db()
      .prepare("SELECT COUNT(*) AS c FROM generations WHERE user_id = ? AND status = 'running' AND updated_at > ?")
      .get(userId, now - 90 * 60_000) as { c: number }).c;
    if (running > 0) return 'busy';
    if (balance(userId) < GENERATION_COST) return 'credits';
    addEntry(userId, -GENERATION_COST, 'debit', id);
    db().prepare('INSERT INTO generations (id, prompt, status, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, prompt, 'running', userId, now, now);
    return 'ok';
  });
  const verdict = admit();
  if (verdict === 'cap') return NextResponse.json({ error: 'The workshop hit today’s limit. Come back tomorrow.' }, { status: 429 });
  if (verdict === 'busy') return NextResponse.json({ error: 'You already have a game cooking — let it finish first.' }, { status: 429 });
  if (verdict === 'credits') {
    return NextResponse.json({ error: `You’re out of credits — a game costs ${GENERATION_COST}.`, code: 'credits' }, { status: 402 });
  }

  const runner = path.join(process.cwd(), 'pipeline', 'run.mjs');
  // The signed-in user owns the result; their id IS the creator_ref for new work.
  const args = [runner, '--prompt', prompt, '--id', id, '--ref', userId];
  if (editSlug) args.push('--edit', editSlug);
  const child = spawn('node', args, { cwd: process.cwd(), detached: true, stdio: 'ignore' });
  child.unref();

  return NextResponse.json({ id });
}
