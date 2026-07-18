import { NextRequest, NextResponse } from 'next/server';
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { db } from '@/lib/db';
import { readJson } from '@/lib/http';

// Spawns the generation pipeline (pipeline/run.mjs) detached; the build page
// watches the trace. Guardrails: claude CLI must exist, and a daily cap keeps
// token burn bounded until real accounts/quota land (07-open-questions.md).
const DAILY_CAP = 20;

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 400) : '';
  if (prompt.length < 8) return NextResponse.json({ error: 'Describe the game in a sentence or two.' }, { status: 400 });

  try {
    execSync('which claude', { stdio: 'ignore' });
  } catch {
    return NextResponse.json({ error: 'The game workshop is offline right now (claude CLI not found).' }, { status: 503 });
  }

  // Atomic cap check + insert in one transaction so concurrent requests can't
  // both pass the count (better-sqlite3 is synchronous; the txn has no await gap).
  const id = crypto.randomBytes(8).toString('hex');
  const now = Date.now();
  const admit = db().transaction(() => {
    const today = (db().prepare('SELECT COUNT(*) AS c FROM generations WHERE created_at > ?').get(now - 86400_000) as { c: number }).c;
    if (today >= DAILY_CAP) return false;
    db().prepare('INSERT INTO generations (id, prompt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, prompt, 'running', now, now);
    return true;
  });
  if (!admit()) {
    return NextResponse.json({ error: 'The workshop hit today’s limit. Come back tomorrow.' }, { status: 429 });
  }

  const runner = path.join(process.cwd(), 'pipeline', 'run.mjs');
  const child = spawn('node', [runner, '--prompt', prompt, '--id', id], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  return NextResponse.json({ id });
}
